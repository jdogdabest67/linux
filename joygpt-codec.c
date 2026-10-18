typedef unsigned int u32;
typedef unsigned char u8;

static u8 clamp_axis(int value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return (u8)value;
}

/* JoyGPT's own demo packet. This is NOT a Nintendo controller protocol. */
__attribute__((visibility("default")))
void encode_report(u32 buttons, int axis_x, int axis_y, u32 out_ptr) {
  u8 *out = (u8 *)(unsigned long)out_ptr;
  out[0] = 0xA1;                  /* JoyGPT demo packet marker */
  out[1] = (u8)(buttons & 0xFF);
  out[2] = (u8)((buttons >> 8) & 0xFF);
  out[3] = clamp_axis(axis_x);
  out[4] = clamp_axis(axis_y);
  out[5] = 0x00;                  /* reserved for future demo flags */
}

__attribute__((visibility("default")))
u32 codec_version(void) { return 1; }
