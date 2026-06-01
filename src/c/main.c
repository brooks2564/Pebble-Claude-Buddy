#include <pebble.h>

// ── Message keys (must match package.json) ──────────���─────────────────────
#define KEY_STATUS     0
#define KEY_TOOL_NAME  1
#define KEY_TOOL_INPUT 2
#define KEY_RESPONSE   3
#define KEY_ANIM_FRAME 4

// ── Status values ───────��─────────────────────────────────────────────────
#define STATUS_IDLE       0
#define STATUS_THINKING   1
#define STATUS_WAITING    2
#define STATUS_APPROVED   3
#define STATUS_DENIED     4

// ── Response values (sent to JS) ──────────────────────────────────────────
#define RESP_DENY         0
#define RESP_ALLOW        1
#define RESP_ALLOW_ALWAYS 2

// ── Layout constants ──────────────────────────────────────────────────────
#define HEADER_H   28
#define FOOTER_H   40
#define BTN_HINT_H 20

// ── State ──────────────────────────────────────���──────────────────────────
static Window    *s_window;
static Layer     *s_canvas;
static TextLayer *s_header_layer;
static TextLayer *s_tool_layer;
static TextLayer *s_input_layer;
static TextLayer *s_hint_layer;

static int  s_status     = STATUS_IDLE;
static int  s_anim_frame = 0;
static char s_tool_name[32]  = "";
static char s_tool_input[64] = "";
static AppTimer *s_anim_timer = NULL;

// ── Response helper ────────���──────────────────────────────────────────────
static void send_response(int resp) {
  if (s_status != STATUS_WAITING) return;
  DictionaryIterator *out;
  if (app_message_outbox_begin(&out) == APP_MSG_OK) {
    dict_write_int32(out, KEY_RESPONSE, resp);
    app_message_outbox_send();
  }
  s_status = (resp == RESP_DENY) ? STATUS_DENIED : STATUS_APPROVED;
}

// ── Touch zone background (3 zones: Allow / Always / Deny) ────────────────
static void draw_touch_zones(GContext *ctx, GRect bounds) {
  int x  = bounds.origin.x;
  int y  = bounds.origin.y;
  int w  = bounds.size.w;
  int h3 = bounds.size.h / 3;

  int y1 = y;           // Allow top
  int y2 = y + h3;      // Always top
  int y3 = y + h3 * 2;  // Deny top
  int h_bottom = bounds.size.h - h3 * 2; // accounts for rounding

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorMintGreen);
  graphics_fill_rect(ctx, GRect(x, y1, w, h3),        4, GCornersTop);
  graphics_context_set_fill_color(ctx, GColorCeleste);
  graphics_fill_rect(ctx, GRect(x, y2, w, h3),        0, GCornerNone);
  graphics_context_set_fill_color(ctx, GColorMelon);
  graphics_fill_rect(ctx, GRect(x, y3, w, h_bottom),  4, GCornersBottom);
#else
  graphics_context_set_fill_color(ctx, GColorLightGray);
  graphics_fill_rect(ctx, GRect(x, y1, w, h3),        4, GCornersTop);
  graphics_context_set_fill_color(ctx, GColorWhite);
  graphics_fill_rect(ctx, GRect(x, y2, w, h3),        0, GCornerNone);
  graphics_context_set_fill_color(ctx, GColorDarkGray);
  graphics_fill_rect(ctx, GRect(x, y3, w, h_bottom),  4, GCornersBottom);
#endif

  // Divider lines
  graphics_context_set_stroke_color(ctx, GColorBlack);
  graphics_context_set_stroke_width(ctx, 1);
  graphics_draw_line(ctx, GPoint(x, y2), GPoint(x + w, y2));
  graphics_draw_line(ctx, GPoint(x, y3), GPoint(x + w, y3));

  // Zone labels — drawn small at the edges so the face sits on top
  GFont small = fonts_get_system_font(FONT_KEY_GOTHIC_14);
  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, "Allow",  small, GRect(x, y1 + 2,       w, 16), GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  graphics_draw_text(ctx, "Always", small, GRect(x, y2 + 2,       w, 16), GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
  graphics_draw_text(ctx, "Deny",   small, GRect(x, y3 + 2,       w, 16), GTextOverflowModeWordWrap, GTextAlignmentCenter, NULL);
}

// ── Face drawing ─────���────────────────────────────────────────────────────
static void draw_face(GContext *ctx, GRect bounds, int status, int frame) {
  int cx = bounds.origin.x + bounds.size.w / 2;
  int cy = bounds.origin.y + bounds.size.h / 2;

  if (status == STATUS_WAITING && touch_service_is_enabled()) {
    draw_touch_zones(ctx, bounds);
  }

#ifdef PBL_COLOR
  GColor face_color = GColorWhite;
  GColor eye_color  = GColorBlack;
  switch (status) {
    case STATUS_THINKING:  face_color = GColorCeleste;      break;
    case STATUS_WAITING:   face_color = GColorChromeYellow; break;
    case STATUS_APPROVED:  face_color = GColorMintGreen;    break;
    case STATUS_DENIED:    face_color = GColorMelon;        break;
    default: break;
  }
  graphics_context_set_fill_color(ctx, face_color);
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif

  graphics_fill_circle(ctx, GPoint(cx, cy), 26);
  graphics_context_set_stroke_color(ctx, GColorBlack);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_circle(ctx, GPoint(cx, cy), 26);

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, eye_color);
#else
  graphics_context_set_fill_color(ctx, GColorBlack);
#endif

  if (status == STATUS_THINKING) {
    for (int i = 0; i < 3; i++) {
      int dot_x = cx - 8 + i * 8;
      int dot_y = (frame % 3 == i) ? cy - 2 : cy + 2;
      graphics_fill_circle(ctx, GPoint(dot_x, dot_y), 3);
    }
  } else {
    graphics_fill_circle(ctx, GPoint(cx - 9, cy - 5), 4);
    graphics_fill_circle(ctx, GPoint(cx + 9, cy - 5), 4);
    graphics_context_set_fill_color(ctx, GColorWhite);
    graphics_fill_circle(ctx, GPoint(cx - 8, cy - 6), 1);
    graphics_fill_circle(ctx, GPoint(cx + 10, cy - 6), 1);
#ifdef PBL_COLOR
    graphics_context_set_fill_color(ctx, eye_color);
#else
    graphics_context_set_fill_color(ctx, GColorBlack);
#endif
  }

  graphics_context_set_stroke_color(ctx, GColorBlack);
  graphics_context_set_stroke_width(ctx, 2);
  switch (status) {
    case STATUS_APPROVED:
      graphics_draw_arc(ctx, GRect(cx - 10, cy + 4, 20, 14),
        GOvalScaleModeFillCircle, DEG_TO_TRIGANGLE(0), DEG_TO_TRIGANGLE(180));
      break;
    case STATUS_DENIED:
      graphics_draw_arc(ctx, GRect(cx - 10, cy + 8, 20, 14),
        GOvalScaleModeFillCircle, DEG_TO_TRIGANGLE(180), DEG_TO_TRIGANGLE(360));
      break;
    case STATUS_WAITING:
      graphics_context_set_fill_color(ctx, GColorBlack);
      graphics_fill_circle(ctx, GPoint(cx, cy + 12), 5);
      break;
    default:
      graphics_draw_line(ctx, GPoint(cx - 8, cy + 12), GPoint(cx + 8, cy + 12));
      break;
  }

  if (status == STATUS_WAITING) {
    graphics_context_set_fill_color(ctx, GColorBlack);
    graphics_fill_rect(ctx, GRect(cx - 2, cy - 42, 4, 10), 0, GCornerNone);
    graphics_fill_circle(ctx, GPoint(cx, cy - 28), 2);
  }
}

static void canvas_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  graphics_context_set_fill_color(ctx, GColorWhite);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);
  int face_h = bounds.size.h - HEADER_H - FOOTER_H;
  draw_face(ctx, GRect(0, HEADER_H, bounds.size.w, face_h), s_status, s_anim_frame);
}

// ���─ Animation timer ─────────���─────────────────────────────────────────────
static void anim_tick(void *data) {
  s_anim_timer = NULL;
  if (s_status == STATUS_THINKING || s_status == STATUS_WAITING) {
    s_anim_frame = (s_anim_frame + 1) % 12;
    layer_mark_dirty(s_canvas);
    s_anim_timer = app_timer_register(400, anim_tick, NULL);
  }
}

static void start_anim(void) {
  if (!s_anim_timer)
    s_anim_timer = app_timer_register(400, anim_tick, NULL);
}

static void stop_anim(void) {
  if (s_anim_timer) {
    app_timer_cancel(s_anim_timer);
    s_anim_timer = NULL;
  }
}

// ── UI update ─��───────────────────────────────────────────────────────────
static void update_ui(void) {
  static const char *status_strings[] = {
    "Idle", "Thinking...", "Permission?", "Approved!", "Denied"
  };
  text_layer_set_text(s_header_layer,
    (s_status < 5) ? status_strings[s_status] : "");

  bool show_tool = (s_status == STATUS_WAITING);
  layer_set_hidden(text_layer_get_layer(s_tool_layer),  !show_tool);
  layer_set_hidden(text_layer_get_layer(s_input_layer), !show_tool);
  layer_set_hidden(text_layer_get_layer(s_hint_layer),  !show_tool);

  if (show_tool) {
    text_layer_set_text(s_tool_layer,  s_tool_name);
    text_layer_set_text(s_input_layer, s_tool_input);
    if (touch_service_is_enabled()) {
      text_layer_set_text(s_hint_layer, "top=Allow mid=Always bot=No");
    } else {
      text_layer_set_text(s_hint_layer, "UP=Allow  SEL=Always  DN=No");
    }
    vibes_double_pulse();
  }

  layer_mark_dirty(s_canvas);

  if (s_status == STATUS_THINKING || s_status == STATUS_WAITING) {
    start_anim();
  } else {
    stop_anim();
    s_anim_frame = 0;
  }
}

// ─��� Touch handler ──���──────────────────────────────────────────────────────
static void __attribute__((unused)) touch_handler(const TouchEvent *event, void *context) {
  if (event->type != TouchEvent_Touchdown) return;
  if (s_status != STATUS_WAITING) return;

  Layer *root   = window_get_root_layer(s_window);
  GRect  bounds = layer_get_bounds(root);
  int face_h = bounds.size.h - HEADER_H - FOOTER_H;
  int h3     = face_h / 3;
  int y_rel  = event->y - HEADER_H; // y relative to top of face area

  int resp;
  if      (y_rel < h3)       resp = RESP_ALLOW;
  else if (y_rel < h3 * 2)   resp = RESP_ALLOW_ALWAYS;
  else                       resp = RESP_DENY;

  send_response(resp);
  update_ui();
}

// ── Button handlers ───────────────────────────────────────────────────────
static void up_click(ClickRecognizerRef r, void *ctx) {
  send_response(RESP_ALLOW);
  update_ui();
}

static void select_click(ClickRecognizerRef r, void *ctx) {
  send_response(RESP_ALLOW_ALWAYS);
  update_ui();
}

static void down_click(ClickRecognizerRef r, void *ctx) {
  send_response(RESP_DENY);
  update_ui();
}

static void click_config(void *ctx) {
  window_single_click_subscribe(BUTTON_ID_UP,     up_click);
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click);
  window_single_click_subscribe(BUTTON_ID_DOWN,   down_click);
}

// ── AppMessage callbacks ───────────���──────────────────────────────────────
static void inbox_received(DictionaryIterator *iter, void *ctx) {
  Tuple *t;

  t = dict_find(iter, KEY_STATUS);
  if (t) s_status = (int)t->value->int32;

  t = dict_find(iter, KEY_TOOL_NAME);
  if (t) {
    strncpy(s_tool_name, t->value->cstring, sizeof(s_tool_name) - 1);
    s_tool_name[sizeof(s_tool_name) - 1] = '\0';
  }

  t = dict_find(iter, KEY_TOOL_INPUT);
  if (t) {
    strncpy(s_tool_input, t->value->cstring, sizeof(s_tool_input) - 1);
    s_tool_input[sizeof(s_tool_input) - 1] = '\0';
  }

  t = dict_find(iter, KEY_ANIM_FRAME);
  if (t) s_anim_frame = (int)t->value->int32;

  update_ui();
}

// ── Window lifecycle ─────���─────────────────────────────────���──────────────
static void window_load(Window *window) {
  Layer *root  = window_get_root_layer(window);
  GRect  bounds = layer_get_bounds(root);

  s_canvas = layer_create(bounds);
  layer_set_update_proc(s_canvas, canvas_update_proc);
  layer_add_child(root, s_canvas);

  s_header_layer = text_layer_create(GRect(0, 4, bounds.size.w, HEADER_H));
  text_layer_set_font(s_header_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(s_header_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_header_layer, GColorClear);
  text_layer_set_text(s_header_layer, "Idle");
  layer_add_child(root, text_layer_get_layer(s_header_layer));

  int footer_y = bounds.size.h - FOOTER_H;

  s_tool_layer = text_layer_create(GRect(4, footer_y, bounds.size.w - 8, 18));
  text_layer_set_font(s_tool_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD));
  text_layer_set_text_alignment(s_tool_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_tool_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_tool_layer));

  s_input_layer = text_layer_create(GRect(4, footer_y + 18, bounds.size.w - 8, 18));
  text_layer_set_font(s_input_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  text_layer_set_text_alignment(s_input_layer, GTextAlignmentCenter);
  text_layer_set_overflow_mode(s_input_layer, GTextOverflowModeTrailingEllipsis);
  text_layer_set_background_color(s_input_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_input_layer));

  s_hint_layer = text_layer_create(GRect(0, bounds.size.h - BTN_HINT_H, bounds.size.w, BTN_HINT_H));
  text_layer_set_font(s_hint_layer, fonts_get_system_font(FONT_KEY_GOTHIC_14));
  text_layer_set_text_alignment(s_hint_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_hint_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_hint_layer));

  layer_set_hidden(text_layer_get_layer(s_tool_layer),  true);
  layer_set_hidden(text_layer_get_layer(s_input_layer), true);
  layer_set_hidden(text_layer_get_layer(s_hint_layer),  true);

  window_set_click_config_provider(window, click_config);
}

static void window_unload(Window *window) {
  stop_anim();
  layer_destroy(s_canvas);
  text_layer_destroy(s_header_layer);
  text_layer_destroy(s_tool_layer);
  text_layer_destroy(s_input_layer);
  text_layer_destroy(s_hint_layer);
}

// ── App init / deinit ──────────────────────────────────────��──────────────
static void init(void) {
  touch_service_subscribe(touch_handler, NULL);

  app_message_register_inbox_received(inbox_received);
  app_message_open(512, 64);

  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){
    .load   = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);
}

static void deinit(void) {
  touch_service_unsubscribe();
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
