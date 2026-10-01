import os, uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen


def text_path(fontfile, text, size):
    """Shape RTL Persian text with HarfBuzz and return (svg path d, width, ascent, descent) in px, origin top-left of line box."""
    blob = hb.Blob.from_file_path(fontfile); face = hb.Face(blob); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {})
    tt = TTFont(fontfile); gs = tt.getGlyphSet(); upm = tt['head'].unitsPerEm
    s = size / upm
    asc = tt['hhea'].ascent * s; desc = -tt['hhea'].descent * s
    def run(pen, dx=0, dy=0):
        x = 0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            name = tt.getGlyphName(info.codepoint)
            gs[name].draw(TransformPen(pen, (s, 0, 0, -s, (x + pos.x_offset) * s - dx, asc - pos.y_offset * s - dy)))
            x += pos.x_advance
    bp = BoundsPen(gs); run(bp); x0, y0, x1, y1 = bp.bounds
    pen = SVGPathPen(gs); run(pen, x0, y0)
    return pen.getCommands(), x1 - x0, y1 - y0, 0   # tight box: width, height

