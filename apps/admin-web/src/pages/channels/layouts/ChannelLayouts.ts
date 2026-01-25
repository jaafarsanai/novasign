export type Zone = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutDef = {
  id: string;
  name: string;
  zones: Zone[];
};

export const ALL_LAYOUTS: LayoutDef[] = [
{ id: "layout_main", name: "Main", zones: [{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 100 }] },
{
id: "layout_main_footer",
name: "Main + Footer",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 78 },
{ id: "z2", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
],
},
{
id: "layout_split_vertical",
name: "Split Vertically",
zones: [
{ id: "z1", name: "Left", x: 0, y: 0, w: 50, h: 100 },
{ id: "z2", name: "Right", x: 50, y: 0, w: 50, h: 100 },
],
},
{
id: "layout_split_horizontal",
name: "Split Horizontally",
zones: [
{ id: "z1", name: "Top", x: 0, y: 0, w: 100, h: 50 },
{ id: "z2", name: "Bottom", x: 0, y: 50, w: 100, h: 50 },
],
},
{
id: "layout_left_bar",
name: "Main + Left Bar",
zones: [
{ id: "z1", name: "Side Zone", x: 0, y: 0, w: 24, h: 100 },
{ id: "z2", name: "Main Zone", x: 24, y: 0, w: 76, h: 100 },
],
},
{
id: "layout_right_bar",
name: "Main + Right Bar",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 76, h: 100 },
{ id: "z2", name: "Side Zone", x: 76, y: 0, w: 24, h: 100 },
],
},
{
id: "layout_triple_vertical",
name: "Triple Vertically",
zones: [
{ id: "z1", name: "Left", x: 0, y: 0, w: 33.33, h: 100 },
{ id: "z2", name: "Center", x: 33.33, y: 0, w: 33.33, h: 100 },
{ id: "z3", name: "Right", x: 66.66, y: 0, w: 33.34, h: 100 },
],
},
{
id: "layout_triple_horizontal",
name: "Triple Horizontally",
zones: [
{ id: "z1", name: "Top", x: 0, y: 0, w: 100, h: 33.33 },
{ id: "z2", name: "Middle", x: 0, y: 33.33, w: 100, h: 33.33 },
{ id: "z3", name: "Bottom", x: 0, y: 66.66, w: 100, h: 33.34 },
],
},
{
id: "layout_main_left_footer",
name: "Main + Left Bar & Footer",
zones: [
{ id: "z1", name: "Left Bar", x: 0, y: 0, w: 24, h: 78 },
{ id: "z2", name: "Main Zone", x: 24, y: 0, w: 76, h: 78 },
{ id: "z3", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
],
},
{
id: "layout_main_left_header",
name: "Main + Left Bar & Header",
zones: [
{ id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
{ id: "z2", name: "Left Bar", x: 0, y: 18, w: 24, h: 82 },
{ id: "z3", name: "Main Zone", x: 24, y: 18, w: 76, h: 82 },
],
},
{
id: "layout_main_right_footer",
name: "Main + Right Bar & Footer",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 76, h: 78 },
{ id: "z2", name: "Right Bar", x: 76, y: 0, w: 24, h: 78 },
{ id: "z3", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
],
},
{
id: "layout_main_right_header",
name: "Main + Right Bar & Header",
zones: [
{ id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
{ id: "z2", name: "Main Zone", x: 0, y: 18, w: 76, h: 82 },
{ id: "z3", name: "Right Bar", x: 76, y: 18, w: 24, h: 82 },
],
},
{
id: "layout_2zones",
name: "2 Zones layout",
zones: [
{ id: "z1", name: "Zone 1", x: 0, y: 0, w: 75, h: 100 },
{ id: "z2", name: "Zone 2", x: 75, y: 0, w: 25, h: 100 },
],
},
{
id: "layout_3zones",
name: "3 Zones layout",
zones: [
{ id: "z1", name: "Zone 1", x: 0, y: 0, w: 70, h: 80 },
{ id: "z2", name: "Zone 2", x: 70, y: 0, w: 30, h: 80 },
{ id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
],
},
{
id: "layout_4zones",
name: "4 Zones layout",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 70, h: 100 },
{ id: "z2", name: "Side 1", x: 70, y: 0, w: 30, h: 33.33 },
{ id: "z3", name: "Side 2", x: 70, y: 33.33, w: 30, h: 33.33 },
{ id: "z4", name: "Side 3", x: 70, y: 66.66, w: 30, h: 33.34 },
],
},
{
id: "layout_5zones",
name: "5 Zones layout",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 78, h: 100 },
{ id: "z2", name: "Right 1", x: 78, y: 0, w: 22, h: 33.33 },
{ id: "z3", name: "Right 2", x: 78, y: 33.33, w: 22, h: 33.33 },
{ id: "z4", name: "Right 3", x: 78, y: 66.66, w: 22, h: 33.34 },
{ id: "z5", name: "Header", x: 0, y: 0, w: 100, h: 0 },
].filter((z) => z.w > 0 && z.h > 0),
},
{
id: "layout_main_upper",
name: "Main + Upper Pane",
zones: [
{ id: "z1", name: "Upper Pane", x: 0, y: 0, w: 100, h: 22 },
{ id: "z2", name: "Main Zone", x: 0, y: 22, w: 100, h: 78 },
],
},
{
id: "layout_main_lower",
name: "Main + Lower Pane",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 78 },
{ id: "z2", name: "Lower Pane", x: 0, y: 78, w: 100, h: 22 },
],
},
{
id: "layout_video_frame",
name: "Video Frame",
zones: [
{ id: "z1", name: "Main Zone", x: 8, y: 10, w: 84, h: 80 },
{ id: "z2", name: "Frame", x: 0, y: 0, w: 100, h: 100 },
],
},
{
id: "layout_ticker",
name: "1 Main Zone + Ticker",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 84 },
{ id: "z2", name: "Tickertape", x: 0, y: 84, w: 100, h: 16 },
],
},
{
id: "layout_left_triple_bar",
name: "Main + Left Triple Bar",
zones: [
{ id: "z1", name: "Left 1", x: 0, y: 0, w: 22, h: 33.33 },
{ id: "z2", name: "Left 2", x: 0, y: 33.33, w: 22, h: 33.33 },
{ id: "z3", name: "Left 3", x: 0, y: 66.66, w: 22, h: 33.34 },
{ id: "z4", name: "Main Zone", x: 22, y: 0, w: 78, h: 100 },
],
},
{
id: "layout_right_triple_bar",
name: "Main + Right Triple Bar",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 78, h: 100 },
{ id: "z2", name: "Right 1", x: 78, y: 0, w: 22, h: 33.33 },
{ id: "z3", name: "Right 2", x: 78, y: 33.33, w: 22, h: 33.33 },
{ id: "z4", name: "Right 3", x: 78, y: 66.66, w: 22, h: 33.34 },
],
},
{
id: "layout_split_v_footer",
name: "Split Vertically + Footer",
zones: [
{ id: "z1", name: "Left", x: 0, y: 0, w: 50, h: 80 },
{ id: "z2", name: "Right", x: 50, y: 0, w: 50, h: 80 },
{ id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
],
},
{
id: "layout_split_h_right",
name: "Split Horizontally + Right Bar",
zones: [
{ id: "z1", name: "Top", x: 0, y: 0, w: 76, h: 50 },
{ id: "z2", name: "Bottom", x: 0, y: 50, w: 76, h: 50 },
{ id: "z3", name: "Right Bar", x: 76, y: 0, w: 24, h: 100 },
],
},
{
id: "layout_picture_in_picture",
name: "Picture-in-Picture",
zones: [
{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 100 },
{ id: "z2", name: "Widget", x: 72, y: 8, w: 24, h: 24 },
],
},
{
id: "layout_quadrants",
name: "4 Quadrants",
zones: [
{ id: "z1", name: "Top Left", x: 0, y: 0, w: 50, h: 50 },
{ id: "z2", name: "Top Right", x: 50, y: 0, w: 50, h: 50 },
{ id: "z3", name: "Bottom Left", x: 0, y: 50, w: 50, h: 50 },
{ id: "z4", name: "Bottom Right", x: 50, y: 50, w: 50, h: 50 },
],
},
{
id: "layout_header_main_footer",
name: "Header + Main + Footer",
zones: [
{ id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
{ id: "z2", name: "Main Zone", x: 0, y: 18, w: 100, h: 64 },
{ id: "z3", name: "Footer", x: 0, y: 82, w: 100, h: 18 },
],
},
{
id: "layout_header_split",
name: "Header + Split",
zones: [
{ id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
{ id: "z2", name: "Left", x: 0, y: 18, w: 50, h: 82 },
{ id: "z3", name: "Right", x: 50, y: 18, w: 50, h: 82 },
],
},
];

