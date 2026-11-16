import base64
import io
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.oxml import parse_xml

DIR = Path(__file__).resolve().parent
IR = Path(sys.argv[2]) if len(sys.argv) > 2 else DIR / 'ir'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'C:/Users/Administrator/Downloads/省政府奖学金之外-矢量可编辑版.pptx'
EMU = 7620          # design px (1600x900 canvas) -> EMU (13.333in slide)
PT = 0.6            # design px -> pt
A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
I = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
DROP = []


def emu(v):
    return int(round(v * EMU))


def mul(A_, B_):
    return [
        A_[0] * B_[0] + A_[2] * B_[1], A_[1] * B_[0] + A_[3] * B_[1],
        A_[0] * B_[2] + A_[2] * B_[3], A_[1] * B_[2] + A_[3] * B_[3],
        A_[0] * B_[4] + A_[2] * B_[5] + A_[4], A_[1] * B_[4] + A_[3] * B_[5] + A_[5]]


def m_apply(M, x, y):
    return M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]


def m_parse(t):
    M = I
    if not t or t == 'none':
        return M
    for fn, args in re.findall(r'(translate|rotate|scale|matrix|skewX|skewY)\(([^)]*)\)', t):
        v = [float(x) for x in re.split(r'[ ,]+', args.strip()) if x]
        if fn == 'translate':
            L = [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
        elif fn == 'rotate':
            a = math.radians(v[0])
            L = [math.cos(a), math.sin(a), -math.sin(a), math.cos(a), 0, 0]
            if len(v) == 3:
                L = mul(mul([1, 0, 0, 1, v[1], v[2]], L), [1, 0, 0, 1, -v[1], -v[2]])
        elif fn == 'scale':
            L = [v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0]
        elif fn == 'skewX':
            L = [1, 0, math.tan(math.radians(v[0])), 1, 0, 0]
        elif fn == 'skewY':
            L = [1, math.tan(math.radians(v[0])), 0, 1, 0, 0]
        else:
            L = v
        M = mul(M, L)
    return M


def m_lin(M):
    return [M[0], M[1], M[2], M[3]]


def is_i(M):
    return all(abs(M[k] - I[k]) < 1e-6 for k in range(4))


def hexc(c):
    return '%02X%02X%02X' % (int(c['r']), int(c['g']), int(c['b']))


def alpha_el(c, extra=1.0):
    a = c.get('a', 1) * extra
    return '<a:alpha val="%d"/>' % int(round(a * 100000)) if a < 0.999 else ''


def set_fill(shape, c, extra=1.0):
    if c and c.get('a', 1) * extra > 0.003:
        shape.fill.solid()
        shape.fill.fore_color.rgb = RGBColor(int(c['r']), int(c['g']), int(c['b']))
        sf = shape._element.spPr.find(qn('a:solidFill'))
        clr = sf[0]
        for old in clr.findall(qn('a:alpha')):
            clr.remove(old)
        a = c.get('a', 1) * extra
        if a < 0.999:
            clr.append(parse_xml('<a:alpha %s val="%d"/>' % (A, int(round(a * 100000)))))
    else:
        shape.fill.background()


def set_line(shape, w, c, dash=None, extra=1.0):
    if not c or w <= 0:
        shape.line.fill.background()
        return
    shape.line.fill.solid()
    shape.line.color.rgb = RGBColor(int(c['r']), int(c['g']), int(c['b']))
    shape.line.width = Emu(emu(w))
    ln = shape._element.spPr.find(qn('a:ln'))
    sf = ln.find(qn('a:solidFill'))
    if sf is not None:
        clr = sf[0]
        a = c.get('a', 1) * extra
        if a < 0.999:
            clr.append(parse_xml('<a:alpha %s val="%d"/>' % (A, int(round(a * 100000)))))
    if dash:
        ln.append(parse_xml('<a:prstDash %s val="%s"/>' % (A, dash)))


def set_shadow(shape, shadow, extra=1.0, rot_add=0.0):
    if not shadow:
        return
    m = re.match(r'rgba?\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px', shadow)
    if not m:
        DROP.append('shadow-unparsed: ' + shadow[:60])
        return
    p = m.group(1).split(',')
    c = {'r': float(p[0]), 'g': float(p[1]), 'b': float(p[2]), 'a': float(p[3]) if len(p) > 3 else 1}
    dx, dy, blur = float(m.group(2)), float(m.group(3)), float(m.group(4))
    dist = math.hypot(dx, dy)
    dirv = int(round((math.degrees(math.atan2(dy, dx)) + rot_add) * 60000)) % 21600000
    spPr = shape._element.spPr
    for old in spPr.findall(qn('a:effectLst')):
        spPr.remove(old)
    spPr.append(parse_xml(
        '<a:effectLst %s><a:outerShdw blurRad="%d" dist="%d" dir="%d" rotWithShape="0">'
        '<a:srgbClr val="%s">%s</a:srgbClr></a:outerShdw></a:effectLst>'
        % (A, emu(blur), emu(dist), dirv, hexc(c), alpha_el(c, extra))))


def custgeom(shape, subpaths, w, h):
    spPr = shape._element.spPr
    geom = spPr.find(qn('a:prstGeom'))
    parts = []
    for sp in subpaths:
        for cmd in sp:
            if cmd[0] in ('M', 'L'):
                tag = 'moveTo' if cmd[0] == 'M' else 'lnTo'
                parts.append('<a:%s><a:pt x="%d" y="%d"/></a:%s>' % (tag, emu(cmd[1]), emu(cmd[2]), tag))
            elif cmd[0] == 'ARC':
                parts.append('<a:arcTo wR="%d" hR="%d" stAng="%d" swAng="%d"/>' % (emu(cmd[1]), emu(cmd[2]), cmd[3], cmd[4]))
            elif cmd[0] == 'C':
                parts.append('<a:cubicBezTo><a:pt x="%d" y="%d"/><a:pt x="%d" y="%d"/><a:pt x="%d" y="%d"/></a:cubicBezTo>' % tuple(emu(v) for v in cmd[1:]))
            elif cmd[0] == 'Z':
                parts.append('<a:close/>')
    xml = ('<a:custGeom %s><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="%d" b="%d"/>'
           '<a:pathLst><a:path w="%d" h="%d">%s</a:path></a:pathLst></a:custGeom>'
           % (A, emu(w), emu(h), emu(w), emu(h), ''.join(parts)))
    el = parse_xml(xml)
    if geom is not None:
        spPr.insert(list(spPr).index(geom), el)
        spPr.remove(geom)
    else:
        spPr.append(el)


def rect_sub(x, y, w, h):
    return [('M', x, y), ('L', x + w, y), ('L', x + w, y + h), ('L', x, y + h), ('Z',)]


def circle_sub(cx, cy, r):
    return [('M', cx + r, cy), ('ARC', r, r, 0, 21600000), ('Z',)]


def quad_sub(pts):
    return [('M', *pts[0])] + [('L', *p) for p in pts[1:]] + [('Z',)]


def clip_poly(pts, x, y, w, h):
    def clip_edge(pts, inside, intersect):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            ia, ib = inside(a), inside(b)
            if ia:
                out.append(a)
                if not ib:
                    out.append(intersect(a, b))
            elif ib:
                out.append(intersect(a, b))
        return out
    for edge in range(4):
        if edge == 0:
            inside = lambda p: p[0] >= x
            intersect = lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))
        elif edge == 1:
            inside = lambda p: p[0] <= x + w
            intersect = lambda a, b: (x + w, a[1] + (b[1] - a[1]) * (x + w - a[0]) / (b[0] - a[0]))
        elif edge == 2:
            inside = lambda p: p[1] >= y
            intersect = lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)
        else:
            inside = lambda p: p[1] <= y + h
            intersect = lambda a, b: (a[0] + (b[0] - a[0]) * (y + h - a[1]) / (b[1] - a[1]), y + h)
        pts = clip_edge(pts, inside, intersect)
        if not pts:
            return []
    return pts


def parse_rgba(s):
    m = re.match(r'rgba?\(([^)]+)\)', s or '')
    if not m:
        return None
    p = m.group(1).split(',')
    return {'r': float(p[0]), 'g': float(p[1]), 'b': float(p[2]), 'a': float(p[3]) if len(p) > 3 else 1}


def parse_svg_color(s, opacity=1.0):
    if not s or s == 'none':
        return None
    if s.startswith('#'):
        h = s[1:]
        if len(h) == 3:
            h = ''.join(ch * 2 for ch in h)
        return {'r': int(h[0:2], 16), 'g': int(h[2:4], 16), 'b': int(h[4:6], 16), 'a': opacity}
    c = parse_rgba(s)
    if c:
        c['a'] *= opacity
    return c


FONT_EA = {'Noto Serif SC': 'Noto Serif SC', 'Noto Sans SC': 'Noto Sans SC', 'JetBrains Mono': 'Noto Sans SC', 'Cormorant Garamond': 'Noto Serif SC'}


def style_run(run, f, extra=1.0):
    font = run.font
    font.size = Pt(round(f['size'] * PT, 1))
    font.bold = int(f['weight']) >= 600
    font.italic = f['style'] == 'italic'
    if f.get('color'):
        font.color.rgb = RGBColor(int(f['color']['r']), int(f['color']['g']), int(f['color']['b']))
    fam = f['family'].split(',')[0].strip().strip('"')
    font.name = fam
    rPr = run._r.get_or_add_rPr()
    ea = rPr.makeelement(qn('a:ea'), {'typeface': FONT_EA.get(fam, 'Noto Sans SC')})
    rPr.append(ea)
    if f.get('ls'):
        rPr.set('spc', str(int(round(f['ls'] * PT * 100))))
    if f.get('color') and f['color'].get('a', 1) * extra < 0.999:
        sf = rPr.find(qn('a:solidFill'))
        if sf is not None:
            sf[0].append(parse_xml('<a:alpha %s val="%d"/>' % (A, int(round(f['color']['a'] * extra * 100000)))))


def add_text(slide, rec, extra=1.0):
    lines = rec['lines']
    if not lines:
        return
    x = min(r['x'] for L in lines for r in L['runs'])
    right = max(r['x'] + r['w'] for L in lines for r in L['runs'])
    w = right - x
    pad = w * 0.12 + 4
    align0 = rec.get('align', 'left')
    if align0 in ('center', 'middle'):
        x -= pad / 2
    elif align0 in ('right', 'end'):
        x -= pad
    w += pad
    f0 = lines[0]['runs'][0]['f']
    lh = float(f0['lh'].replace('px', '')) if f0['lh'].endswith('px') else f0['size'] * 1.4
    y = lines[0]['y'] - max(0.0, (lh - lines[0]['h']) / 2)
    h = (len(lines) - 1) * lh + lines[-1]['h'] + max(0.0, (lh - lines[-1]['h']) / 2)
    tb = slide.shapes.add_textbox(Emu(emu(x)), Emu(emu(y)), Emu(emu(w)), Emu(emu(h + 2)))
    tf = tb.text_frame
    tf.word_wrap = False
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.TOP
    align = {'left': PP_ALIGN.LEFT, 'center': PP_ALIGN.CENTER, 'right': PP_ALIGN.RIGHT, 'justify': PP_ALIGN.JUSTIFY, 'start': PP_ALIGN.LEFT, 'end': PP_ALIGN.RIGHT}.get(rec.get('align'), PP_ALIGN.LEFT)
    for i, L in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = Pt(round(lh * PT, 2))
        p.space_before = Pt(0)
        p.space_after = Pt(0)
        for r in L['runs']:
            run = p.add_run()
            run.text = r['t']
            style_run(run, r['f'], extra)


def add_picture(slide, url, r):
    data = base64.b64decode(url.split(',', 1)[1])
    slide.shapes.add_picture(io.BytesIO(data), Emu(emu(r['x'])), Emu(emu(r['y'])), Emu(emu(r['w'])), Emu(emu(r['h'])))


def bake_dots(slide, rec, c, radius, size, pos):
    x, y, w, h = rec['r']['x'], rec['r']['y'], rec['r']['w'], rec['r']['h']
    sx, sy = size
    px, py = pos
    subs = []
    cy = y + py + sy / 2
    while cy < y + h + radius:
        cx = x + px + sx / 2
        while cx < x + w + radius:
            subs.append(circle_sub(cx - x, cy - y, radius))
            cx += sx
        cy += sy
    if not subs:
        return
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(emu(x)), Emu(emu(y)), Emu(emu(w)), Emu(emu(h)))
    custgeom(sh, subs, w, h)
    set_fill(sh, c, rec['opacity'])
    sh.line.fill.background()
    sh.shadow.inherit = False


def bake_hatch(slide, rec, c, stripe, period, angle):
    x, y, w, h = rec['r']['x'], rec['r']['y'], rec['r']['w'], rec['r']['h']
    th = math.radians(angle)
    ax, ay = math.sin(th), -math.cos(th)
    diag = math.hypot(w, h)
    subs = []
    u = -diag
    while u < diag:
        p0 = (x + w / 2 + ax * u - ay * diag, y + h / 2 + ay * u + ax * diag)
        p1 = (x + w / 2 + ax * u + ay * diag, y + h / 2 + ay * u - ax * diag)
        p2 = (x + w / 2 + ax * (u + stripe) + ay * diag, y + h / 2 + ay * (u + stripe) - ax * diag)
        p3 = (x + w / 2 + ax * (u + stripe) - ay * diag, y + h / 2 + ay * (u + stripe) + ax * diag)
        poly = clip_poly([p0, p1, p2, p3], x, y, w, h)
        if len(poly) >= 3:
            subs.append(quad_sub([(p[0] - x, p[1] - y) for p in poly]))
        u += period
    if not subs:
        return
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(emu(x)), Emu(emu(y)), Emu(emu(w)), Emu(emu(h)))
    custgeom(sh, subs, w, h)
    set_fill(sh, c, rec['opacity'])
    sh.line.fill.background()
    sh.shadow.inherit = False


def svg_path_cmds(d):
    toks = re.findall(r'([MmLlHhVvCcQqZz])|(-?[\d.]+(?:e-?\d+)?)', d)
    cmds, cur, start = [], (0.0, 0.0), (0.0, 0.0)
    i = 0
    seq = [(t[0], t[1]) for t in toks]
    while i < len(seq):
        op, val = seq[i]
        if op:
            i += 1
            if op in 'Zz':
                cmds.append(('Z',))
                cur = start
                continue
            nums = []
            while i < len(seq) and not seq[i][0]:
                nums.append(float(seq[i][1]))
                i += 1
            rel = op.islower()
            O = op.upper()
            k = 0
            while k < len(nums):
                if O == 'M':
                    x, y = nums[k], nums[k + 1]
                    if rel:
                        x += cur[0]; y += cur[1]
                    cmds.append(('M', x, y))
                    cur = start = (x, y)
                    k += 2
                    O = 'L'
                elif O == 'L':
                    x, y = nums[k], nums[k + 1]
                    if rel:
                        x += cur[0]; y += cur[1]
                    cmds.append(('L', x, y))
                    cur = (x, y)
                    k += 2
                elif O == 'H':
                    x = nums[k] + (cur[0] if rel else 0)
                    cmds.append(('L', x, cur[1]))
                    cur = (x, cur[1])
                    k += 1
                elif O == 'V':
                    y = nums[k] + (cur[1] if rel else 0)
                    cmds.append(('L', cur[0], y))
                    cur = (cur[0], y)
                    k += 1
                elif O == 'C':
                    v = nums[k:k + 6]
                    if rel:
                        v = [v[j] + cur[j % 2] for j in range(6)]
                    cmds.append(('C', *v))
                    cur = (v[4], v[5])
                    k += 6
                elif O == 'Q':
                    v = nums[k:k + 4]
                    if rel:
                        v = [v[j] + cur[j % 2] for j in range(4)]
                    c1 = (cur[0] + 2 / 3 * (v[0] - cur[0]), cur[1] + 2 / 3 * (v[1] - cur[1]))
                    c2 = (v[2] + 2 / 3 * (v[0] - v[2]), v[3] + 2 / 3 * (v[1] - v[3]))
                    cmds.append(('C', c1[0], c1[1], c2[0], c2[1], v[2], v[3]))
                    cur = (v[2], v[3])
                    k += 4
                else:
                    k += 1
        else:
            i += 1
    return cmds


def xform_cmds(cmds, M):
    out = []
    for c in cmds:
        if c[0] in 'ML':
            out.append((c[0], *m_apply(M, c[1], c[2])))
        elif c[0] == 'C':
            pts = [m_apply(M, c[1 + j], c[2 + j]) for j in range(0, 6, 2)]
            out.append(('C', pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]))
        else:
            out.append(c)
    return out


class SvgMapper:
    def __init__(self, slide, rec):
        self.slide = slide
        self.rec = rec
        self.patterns = {}
        self.root = ET.fromstring(rec['html'])
        vb = self.root.get('viewBox')
        if vb:
            self.vx, self.vy, self.vw, self.vh = map(float, vb.split())
        else:
            self.vx = self.vy = 0.0
            self.vw = self.dim(self.root.get('width'), rec['r']['w'])
            self.vh = self.dim(self.root.get('height'), rec['r']['h'])
        self.s = rec['r']['w'] / self.vw if self.vw else 1.0
        self.ox, self.oy = rec['r']['x'], rec['r']['y']
        for d in self.root.iter():
            if d.tag.endswith('pattern'):
                self.patterns[d.get('id')] = d

    def dim(self, v, fallback):
        if not v:
            return fallback
        if v.endswith('%'):
            return fallback * float(v[:-1]) / 100.0
        return float(v)

    def pt(self, x, y):
        return self.ox + (x - self.vx) * self.s, self.oy + (y - self.vy) * self.s

    def shape(self, x, y, w, h, kind=MSO_SHAPE.RECTANGLE):
        return self.slide.shapes.add_shape(kind, Emu(emu(x)), Emu(emu(y)), Emu(emu(max(w, 0.1))), Emu(emu(max(h, 0.1))))

    def emit(self, el, M, op):
        tag = el.tag.split('}')[-1]
        if tag in ('filter', 'feTurbulence', 'feColorMatrix', 'feComposite', 'feBlend'):
            return
        M2 = mul(M, m_parse(el.get('transform')))
        if tag == 'defs':
            for ch in el:
                self.emit(ch, M2, op)
            return
        if tag == 'g':
            nop = op * float(el.get('opacity', 1))
            for ch in el:
                self.emit(ch, M2, nop)
            return
        fill = parse_svg_color(el.get('fill'), op * float(el.get('fill-opacity', 1)))
        stroke = parse_svg_color(el.get('stroke'), op * float(el.get('stroke-opacity', 1)))
        sw = float(el.get('stroke-width', 0))
        dash = el.get('stroke-dasharray')
        if tag == 'rect':
            rx, ry = self.dim(el.get('x'), 0.0), self.dim(el.get('y'), 0.0)
            rw, rh = self.dim(el.get('width'), self.vw), self.dim(el.get('height'), self.vh)
            if 'url(#' in (el.get('fill') or ''):
                self.pattern_fill(el.get('fill'), rx, ry, rw, rh, M2, op)
                return
            corners = [m_apply(M2, rx + dx, ry + dy) for dx, dy in ((0, 0), (rw, 0), (rw, rh), (0, rh))]
            pcs = [self.pt(*c) for c in corners]
            x0, y0 = min(p[0] for p in pcs), min(p[1] for p in pcs)
            x1, y1 = max(p[0] for p in pcs), max(p[1] for p in pcs)
            sh = self.shape(x0, y0, x1 - x0, y1 - y0)
            if not is_i(M2):
                custgeom(sh, [quad_sub([(p[0] - x0, p[1] - y0) for p in pcs])], x1 - x0, y1 - y0)
            set_fill(sh, fill)
            set_line(sh, sw * self.s, stroke)
            sh.shadow.inherit = False
        elif tag == 'circle':
            cx, cy = m_apply(M2, float(el.get('cx', 0)), float(el.get('cy', 0)))
            cx, cy = self.pt(cx, cy)
            r = float(el.get('r', 0)) * self.s * math.sqrt(abs(M2[0] * M2[3] - M2[1] * M2[2]))
            if stroke and dash:
                nums = [float(v) for v in re.split(r'[ ,]+', dash.strip())]
                if len(nums) == 2 and nums[0] > 40:
                    circ = 2 * math.pi * r
                    subs = []
                    off = 0.0
                    while off < circ:
                        seg = min(nums[0], circ - off)
                        st = int(off / circ * 21600000)
                        th = st / 60000 * math.pi / 180
                        subs.append([('M', r + r * math.cos(th), r + r * math.sin(th)), ('ARC', r, r, st, int(seg / circ * 21600000))])
                        off += nums[0] + nums[1]
                    sh = self.shape(cx - r, cy - r, 2 * r, 2 * r)
                    custgeom(sh, subs, 2 * r, 2 * r)
                    sh.fill.background()
                    set_line(sh, sw * self.s, stroke)
                    sh.shadow.inherit = False
                    return
                sh = self.shape(cx - r, cy - r, 2 * r, 2 * r, MSO_SHAPE.OVAL)
                sh.fill.background()
                set_line(sh, sw * self.s, stroke, dash='dash')
                sh.shadow.inherit = False
                return
            sh = self.shape(cx - r, cy - r, 2 * r, 2 * r, MSO_SHAPE.OVAL)
            set_fill(sh, fill)
            set_line(sh, sw * self.s, stroke)
            sh.shadow.inherit = False
        elif tag in ('polygon', 'path', 'line'):
            if tag == 'polygon':
                pts = [float(v) for v in re.split(r'[ ,]+', el.get('points', '').strip())]
                cmds = [('M', pts[0], pts[1])] + [('L', pts[i], pts[i + 1]) for i in range(2, len(pts), 2)] + [('Z',)]
            elif tag == 'line':
                cmds = [('M', float(el.get('x1')), float(el.get('y1'))), ('L', float(el.get('x2')), float(el.get('y2')))]
            else:
                cmds = svg_path_cmds(el.get('d', ''))
            cmds = xform_cmds(cmds, M2)
            xs = [c[1] for c in cmds if c[0] in 'ML'] + [c[5] for c in cmds if c[0] == 'C']
            ys = [c[2] for c in cmds if c[0] in 'ML'] + [c[6] for c in cmds if c[0] == 'C']
            if not xs:
                return
            x0, y0 = self.pt(min(xs), min(ys))
            x1, y1 = self.pt(max(xs), max(ys))
            w, h = max(x1 - x0, 0.1), max(y1 - y0, 0.1)
            lx, ly = min(xs), min(ys)
            local = []
            for c in cmds:
                if c[0] in 'ML':
                    local.append((c[0], (c[1] - lx) * self.s, (c[2] - ly) * self.s))
                elif c[0] == 'C':
                    local.append(('C', *[(v - (lx if j % 2 == 0 else ly)) * self.s for j, v in enumerate(c[1:])]))
                else:
                    local.append(c)
            sh = self.shape(x0, y0, w, h)
            custgeom(sh, [local], w, h)
            set_fill(sh, fill if tag != 'line' else None)
            set_line(sh, sw * self.s, stroke, dash='dash' if dash and tag == 'line' else None)
            sh.shadow.inherit = False
        elif tag == 'text':
            x, y = m_apply(M2, float(el.get('x', 0)), float(el.get('y', 0)))
            x, y = self.pt(x, y)
            size = float(el.get('font-size', 16)) * self.s
            txt = ''.join(el.itertext())
            anchor = el.get('text-anchor', 'start')
            w = sum(size if ord(ch) > 0x2E80 else size * 0.62 for ch in txt)
            bx = x - w / 2 if anchor == 'middle' else (x - w if anchor == 'end' else x)
            fam = el.get('font-family', 'Noto Sans SC').split(',')[0].strip().strip('"')
            f = {'family': fam, 'size': size, 'weight': el.get('font-weight', '400'), 'style': 'normal', 'color': fill or {'r': 0, 'g': 0, 'b': 0, 'a': 1}, 'ls': 0, 'lh': '%spx' % (size * 1.2)}
            rec = {'lines': [{'y': y - size * 0.9, 'h': size * 1.3, 'runs': [{'x': bx, 'y': y - size * 0.9, 'w': w, 'h': size * 1.3, 't': txt, 'f': f}]}], 'align': 'left'}
            add_text(self.slide, rec, op)
            return
        for ch in el:
            self.emit(ch, M2, op)

    def pattern_fill(self, fillref, x, y, w, h, M, op):
        pid = re.match(r'url\(#([^)]+)\)', fillref).group(1)
        pat = self.patterns.get(pid)
        if pat is None:
            DROP.append('pattern-missing: ' + pid)
            return
        corners = [m_apply(M, x + dx, y + dy) for dx, dy in ((0, 0), (w, 0), (w, h), (0, h))]
        bx0, by0 = min(c[0] for c in corners), min(c[1] for c in corners)
        bx1, by1 = max(c[0] for c in corners), max(c[1] for c in corners)
        tw, th = float(pat.get('width', 6)), float(pat.get('height', 6))
        subs, colors = [], []
        ty = by0
        while ty < by1:
            tx = bx0
            while tx < bx1:
                for ch in pat:
                    ctag = ch.tag.split('}')[-1]
                    c = parse_svg_color(ch.get('fill'), op * float(ch.get('fill-opacity', 1)))
                    if ctag == 'rect':
                        subs.append(rect_sub(tx + float(ch.get('x', 0)) - bx0, ty + float(ch.get('y', 0)) - by0, float(ch.get('width', 0)), float(ch.get('height', 0))))
                        colors.append(c)
                    elif ctag == 'circle':
                        subs.append(circle_sub(tx + float(ch.get('cx', 0)) - bx0, ty + float(ch.get('cy', 0)) - by0, float(ch.get('r', 0))))
                        colors.append(c)
                tx += tw
            ty += th
        if not subs:
            return
        groups = {}
        for sp, c in zip(subs, colors):
            groups.setdefault(hexc(c) + '|' + str(c['a']), []).append(sp)
        px, py = self.pt(bx0, by0)
        pw, ph = (bx1 - bx0) * self.s, (by1 - by0) * self.s
        for key, gs in groups.items():
            c = parse_svg_color('#' + key.split('|')[0])
            c['a'] = float(key.split('|')[1])
            sh = self.shape(px, py, pw, ph)
            custgeom(sh, gs, pw, ph)
            set_fill(sh, c)
            sh.line.fill.background()
            sh.shadow.inherit = False

    def run(self):
        if 'feTurbulence' in self.rec['html']:
            DROP.append('grain-overlay svg skipped')
            return
        M = m_parse(self.root.get('transform'))
        op = float(self.root.get('opacity', 1)) * self.rec.get('opacity', 1)
        for ch in self.root:
            self.emit(ch, M, op)


def map_box(slide, rec, assets):
    r = rec['r']
    op = rec['opacity']
    bgi = rec.get('bgi') or ''
    if rec.get('blend') == 'multiply':
        DROP.append('blend-multiply texture box')
        return
    if 'radial-gradient' in bgi:
        m = re.search(r'radial-gradient\((rgba?\([^)]+\))\s+([\d.]+)px', bgi)
        sm = re.match(r'([\d.]+)px\s+([\d.]+)px', rec.get('bgSize') or '6px 6px')
        size = [float(v) for v in sm.groups()] if sm else [6, 6]
        posm = re.match(r'([\d.]+)px\s+([\d.]+)px', rec.get('bgPos') or '0px 0px')
        pos = [float(v) for v in posm.groups()] if posm else [0, 0]
        if m:
            bake_dots(slide, rec, parse_rgba(m.group(1)), float(m.group(2)), size, pos)
            return
    if 'repeating-linear-gradient' in bgi:
        m = re.search(r'repeating-linear-gradient\(([-\d.]+)deg,\s*(rgba?\([^)]+\)),\s*rgba?\([^)]+\)\s+([\d.]+)px,\s*rgba?\([^)]+\)\s+([\d.]+)px', bgi)
        if m:
            bake_hatch(slide, rec, parse_rgba(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(1)))
            return
    if 'url(' in bgi and rec.get('imgs'):
        add_picture(slide, assets[rec['imgs'][0]], r)
        return
    M = m_parse(rec.get('transform'))
    rot = math.degrees(math.atan2(M[1], M[0])) if not is_i(M) else 0.0
    sh = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(emu(r['x'])), Emu(emu(r['y'])), Emu(emu(r['w'])), Emu(emu(r['h'])))
    w0, h0 = rec.get('w0', r['w']), rec.get('h0', r['h'])
    lin = m_lin(M)
    corners = [m_apply(lin + [0, 0], cx, cy) for cx, cy in ((0, 0), (w0, 0), (w0, h0), (0, h0))]
    mx, my = min(c[0] for c in corners), min(c[1] for c in corners)
    if not is_i(M):
        custgeom(sh, [quad_sub([(c[0] - mx, c[1] - my) for c in corners])], r['w'], r['h'])
    set_fill(sh, rec.get('bg'), op)
    bw = rec.get('bw', [0, 0, 0, 0])
    if max(bw) > 0 and all(w == bw[0] for w in bw):
        set_line(sh, bw[0], rec['bc'][0], extra=op)
    else:
        sh.line.fill.background()
        strips = [(0, 0, w0, bw[0]), (w0 - bw[1], 0, bw[1], h0), (0, h0 - bw[2], w0, bw[2]), (0, 0, bw[3], h0)]
        for i, (sx, sy, sw, shh) in enumerate(strips):
            if bw[i] <= 0:
                continue
            sc = [m_apply(lin + [0, 0], sx + dx, sy + dy) for dx, dy in ((0, 0), (sw, 0), (sw, shh), (0, shh))]
            bs = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(emu(r['x'])), Emu(emu(r['y'])), Emu(emu(r['w'])), Emu(emu(r['h'])))
            custgeom(bs, [quad_sub([(c[0] - mx, c[1] - my) for c in sc])], r['w'], r['h'])
            set_fill(bs, rec['bc'][i], op)
            bs.line.fill.background()
            bs.shadow.inherit = False
    set_shadow(sh, rec.get('shadow'), op, rot_add=rot)


def main():
    assets = json.loads((IR / 'assets.json').read_text('utf8'))
    prs = Presentation()
    prs.slide_width = Emu(12192000)
    prs.slide_height = Emu(6858000)
    files = sorted(IR.glob('S*.json'))
    for f in files:
        recs = json.loads(f.read_text('utf8'))
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        for rec in recs:
            try:
                if rec['kind'] == 'box':
                    map_box(slide, rec, assets)
                elif rec['kind'] == 'text':
                    add_text(slide, rec)
                elif rec['kind'] == 'img':
                    add_picture(slide, assets[rec['src']], rec['r'])
                elif rec['kind'] == 'svg':
                    SvgMapper(slide, rec).run()
            except Exception as e:
                DROP.append('%s %s idx=%s: %s' % (f.stem, rec['kind'], rec.get('idx'), e))
        print(f.stem, 'shapes=', len(slide.shapes._spTree))
    prs.save(OUT)
    print('saved:', OUT)
    print('dropped/unmapped:', len(DROP))
    for d in DROP[:25]:
        print('  -', d)


if __name__ == '__main__':
    main()