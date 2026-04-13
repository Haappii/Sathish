from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

W, H = 1080, 1800
img = Image.new("RGB", (W, H), (8, 4, 22))
draw = ImageDraw.Draw(img)

# ── Fonts ─────────────────────────────────────────────────────────────────────
def fnt(size, bold=False):
    p = "C:/Windows/Fonts/" + ("arialbd.ttf" if bold else "arial.ttf")
    return ImageFont.truetype(p, size)

def bahn(size):
    return ImageFont.truetype("C:/Windows/Fonts/bahnschrift.ttf", size)

# ── Color palette ─────────────────────────────────────────────────────────────
BG1       = (8,   4,  22)
BG2       = (18,  6,  42)
PURPLE    = (130,  60, 255)
PURPLE2   = (180, 100, 255)
CYAN      = (0,  200, 255)
GOLD      = (255, 195,  30)
GOLD2     = (255, 230, 100)
WHITE     = (255, 255, 255)
GREY      = (160, 170, 200)
GREY2     = (100, 110, 140)
CARD_BG   = (20,  14,  48)
CARD_BOR  = (45,  35,  80)

ACCENTS = [
    (130,  60, 255),   # purple
    (0,   200, 255),   # cyan
    (40,  220, 130),   # green
    (255, 195,  30),   # gold
    (255,  80, 160),   # pink
    (255, 130,  50),   # orange
]

# ── Helpers ───────────────────────────────────────────────────────────────────
def lerp(a, b, t): return int(a + (b - a) * t)
def lerp_col(c1, c2, t): return (lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t))

def h_grad(x1, y1, x2, y2, c1, c2):
    for i in range(x2 - x1):
        t = i / max(x2 - x1 - 1, 1)
        draw.line([(x1+i, y1), (x1+i, y2)], fill=lerp_col(c1, c2, t))

def v_grad(x1, y1, x2, y2, c1, c2):
    for i in range(y2 - y1):
        t = i / max(y2 - y1 - 1, 1)
        draw.line([(x1, y1+i), (x2, y1+i)], fill=lerp_col(c1, c2, t))

def rr(x1, y1, x2, y2, r, fill=None, outline=None, ow=2):
    draw.rounded_rectangle([x1,y1,x2,y2], radius=r, fill=fill, outline=outline, width=ow)

def ct(y, text, f, color, offset=0):
    bb = draw.textbbox((0,0), text, font=f)
    tw = bb[2]-bb[0]
    draw.text(((W-tw)//2 + offset, y), text, font=f, fill=color)

def glow_circle(cx, cy, radius, color, intensity=40):
    for r in range(radius, 0, -4):
        alpha = int(intensity * (1 - r/radius))
        c = tuple(min(255, BG1[i] + int((color[i]-BG1[i]) * alpha/255)) for i in range(3))
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=c)

# ── BG glow blobs ─────────────────────────────────────────────────────────────
glow_circle(900, 120, 350, PURPLE, 60)
glow_circle(100, 500, 280, CYAN,   40)
glow_circle(950, 950, 300, (80, 0, 180), 50)
glow_circle(80, 1400, 260, CYAN, 35)
glow_circle(W//2, 1650, 320, PURPLE, 45)

# ── HEADER ────────────────────────────────────────────────────────────────────
# gradient band
h_grad(0, 0, W, 240, (80, 0, 200), (0, 160, 255))

# subtle noise texture on header
for _ in range(3000):
    nx = np.random.randint(0, W)
    ny = np.random.randint(0, 240)
    a  = np.random.randint(5, 25)
    draw.point((nx, ny), fill=(255,255,255,a) if False else
               (min(255, img.getpixel((nx,ny))[0]+a),)*3)

# logo box
rr(40, 32, 120, 112, 20, fill=(255,255,255,30), outline=(255,255,255,80), ow=2)

# "H" letter as logo
draw.text((62, 38), "H", font=bahn(70), fill=(255,255,255))

# App name
draw.text((138, 28), "Haappii", font=bahn(76), fill=WHITE)
bb = draw.textbbox((138, 28), "Haappii", font=bahn(76))
draw.text((bb[2]+8, 28), "Billing", font=bahn(76), fill=GOLD)

# subtitle
draw.text((140, 118), "Smart POS & Billing Software for Every Business", font=fnt(22), fill=(210,225,255))

# badge pill top right
rr(W-310, 24, W-24, 58, 17, fill=(255,255,255,30), outline=(255,255,255,60), ow=1)
draw.text((W-298, 33), "Made for Indian Businesses", font=fnt(16,True), fill=WHITE)

# wave divider
pts = []
for x in range(0, W+1, 4):
    y = 240 + int(12 * np.sin(x * np.pi / 200))
    pts.append((x, y))
pts += [(W, 280), (0, 280)]
draw.polygon(pts, fill=BG1)

# ── FREE TRIAL BANNER ─────────────────────────────────────────────────────────
TY = 268
# outer glow
for g in range(12, 0, -2):
    rr(30-g, TY-g, W-30+g, TY+118+g, 22+g, fill=(200,150,0, 0),
       outline=(200,150,0, max(0,30-g*3)), ow=1)

# gold gradient background
h_grad(30, TY, W-30, TY+118, (220, 160, 0), (255, 215, 50))
rr(30, TY, W-30, TY+118, 20, outline=(255,240,120), ow=2)

# gift box icon (drawn)
gx, gy = 68, TY+24
draw.rectangle([gx, gy+14, gx+52, gy+56], fill=(180,100,0))
draw.rectangle([gx, gy+8,  gx+52, gy+22], fill=(150,80,0))
draw.rectangle([gx+22, gy, gx+30, gy+56], fill=(220,140,0))
draw.line([(gx+26, gy), (gx+14, gy-10)], fill=(255,100,50), width=3)
draw.line([(gx+26, gy), (gx+38, gy-10)], fill=(255,100,50), width=3)

# text
draw.text((140, TY+10), "2 MONTHS FREE TRIAL", font=bahn(38), fill=(20, 8, 0))
draw.text((140, TY+60), "No credit card required  |  Full features unlocked  |  Start today!", font=fnt(19), fill=(60,30,0))
draw.text((140, TY+90), "Offer valid for new sign-ups only. Limited time.", font=fnt(15), fill=(100,60,10))

# ── TAGLINE ───────────────────────────────────────────────────────────────────
ct(422, "Everything you need to run your business", bahn(34), WHITE)
ct(466, "smarter — all in one place.", bahn(34), CYAN)

# dots
for i, dot_c in enumerate([(130,60,255),(0,200,255),(40,220,130),(255,195,30),(255,80,160)]):
    dx = W//2 - 80 + i*40
    draw.ellipse([dx-4, 516, dx+4, 524], fill=dot_c)

# ── FEATURE CARDS ─────────────────────────────────────────────────────────────
features = [
    ("BILLING &\nINVOICING",
     ["Fast invoice generation", "GST / Tax calculations",
      "Discounts & coupons", "Print & WhatsApp bills",
      "Draft & return management"],
     ACCENTS[0], "bill"),

    ("INVENTORY\nMANAGEMENT",
     ["Real-time stock tracking", "Item lots & batch control",
      "Reorder alerts", "Stock audits & transfers",
      "Supplier ledger"],
     ACCENTS[1], "box"),

    ("REPORTS &\nANALYTICS",
     ["Sales & revenue trends", "Item / category reports",
      "Branch performance", "Export PDF & Excel",
      "Day-close summaries"],
     ACCENTS[2], "chart"),

    ("RESTAURANT\n& TABLE",
     ["Table grid management", "Kitchen display system",
      "QR menu & online orders", "Reservations",
      "Recipe management"],
     ACCENTS[3], "fork"),

    ("CUSTOMERS\n& LOYALTY",
     ["Customer database", "Dues & credit tracking",
      "Loyalty points program", "Gift cards",
      "Delivery management"],
     ACCENTS[4], "person"),

    ("OPERATIONS\n& ADMIN",
     ["Multi-branch support", "Role-based access control",
      "Employee attendance", "Expense tracking",
      "Offline sync capability"],
     ACCENTS[5], "gear"),
]

CARD_W = 490
CARD_H = 230
GAP    = 20
GRID_X = (W - 2*CARD_W - GAP) // 2
GRID_Y = 548

def draw_mini_icon(cx, cy, kind, color):
    """Draw a small geometric icon."""
    s = 18
    if kind == "bill":
        draw.rectangle([cx-s//2, cy-s//2, cx+s//2, cy+s//2], outline=color, width=2)
        for ly in [-6, 0, 6]:
            draw.line([(cx-s//2+4, cy+ly), (cx+s//2-4, cy+ly)], fill=color, width=2)
    elif kind == "box":
        pts = [(cx,cy-s//2),(cx+s//2,cy),(cx,cy+s//2),(cx-s//2,cy)]
        draw.polygon(pts, outline=color, fill=None)
        draw.line([(cx-s//2,cy),(cx+s//2,cy)], fill=color, width=2)
        draw.line([(cx,cy-s//2),(cx,cy)], fill=color, width=2)
    elif kind == "chart":
        bw = 8
        for i,bh in enumerate([s//2, s, s*2//3, s*4//5]):
            bx = cx - s//2 + i*(bw+3)
            draw.rectangle([bx, cy+s//2-bh, bx+bw, cy+s//2], fill=color)
    elif kind == "fork":
        draw.line([(cx-6,cy-s//2),(cx-6,cy+s//2)], fill=color, width=2)
        draw.line([(cx+6,cy-s//2),(cx+6,cy+s//2)], fill=color, width=2)
        draw.arc([(cx-6,cy-s//4),(cx+6,cy+s//4)], 0, 180, fill=color, width=2)
        draw.line([(cx,cy-s//2),(cx,cy+s//2)], fill=color, width=2)
    elif kind == "person":
        draw.ellipse([cx-8,cy-s//2,cx+8,cy-s//4], outline=color, width=2)
        draw.arc([cx-s//2,cy-s//4,cx+s//2,cy+s//2], 0, 180, fill=color, width=2)
    elif kind == "gear":
        draw.ellipse([cx-8,cy-8,cx+8,cy+8], outline=color, width=2)
        for angle in range(0, 360, 45):
            import math
            rad = math.radians(angle)
            x1 = cx + int(9*math.cos(rad)); y1 = cy + int(9*math.sin(rad))
            x2 = cx + int(14*math.cos(rad)); y2 = cy + int(14*math.sin(rad))
            draw.line([(x1,y1),(x2,y2)], fill=color, width=3)

for idx, (title, bullets, accent, icon_kind) in enumerate(features):
    col = idx % 2
    row = idx // 2
    cx = GRID_X + col * (CARD_W + GAP)
    cy = GRID_Y + row * (CARD_H + GAP)

    # card shadow
    rr(cx+4, cy+4, cx+CARD_W+4, cy+CARD_H+4, 18, fill=(0,0,10))

    # card bg
    rr(cx, cy, cx+CARD_W, cy+CARD_H, 18, fill=CARD_BG, outline=CARD_BOR, ow=1)

    # left accent stripe
    rr(cx, cy, cx+6, cy+CARD_H, 3, fill=accent)

    # icon circle
    icx, icy = cx+46, cy+CARD_H//2
    draw.ellipse([icx-26, icy-26, icx+26, icy+26],
                 fill=tuple(max(0,c//5) for c in accent))
    draw.ellipse([icx-26, icy-26, icx+26, icy+26],
                 outline=accent, fill=None)
    draw_mini_icon(icx, icy, icon_kind, accent)

    # divider line
    draw.line([(cx+84, cy+20), (cx+84, cy+CARD_H-20)], fill=CARD_BOR, width=1)

    # title lines
    t_lines = title.split("\n")
    ty = cy + (CARD_H - len(t_lines)*30 - len(bullets)*24) // 2
    for tl in t_lines:
        draw.text((cx+100, ty), tl, font=bahn(22), fill=accent)
        ty += 29

    ty += 6
    # bullet points
    for b in bullets:
        # tick mark
        draw.ellipse([cx+100, ty+5, cx+108, ty+13],
                     fill=tuple(max(0,c//4) for c in accent))
        draw.line([(cx+102, ty+9),(cx+105, ty+12)], fill=accent, width=2)
        draw.line([(cx+105, ty+12),(cx+110, ty+6)], fill=accent, width=2)
        draw.text((cx+116, ty), b, font=fnt(15), fill=GREY)
        ty += 24

# ── STATS BAR ─────────────────────────────────────────────────────────────────
SY = GRID_Y + 3*(CARD_H+GAP) + 20

# bg
h_grad(0, SY, W, SY+100, (20,8,55), (8,20,50))
draw.line([(0,SY),(W,SY)], fill=(60,40,110), width=1)
draw.line([(0,SY+100),(W,SY+100)], fill=(60,40,110), width=1)

stats = [("25+","Modules"), ("GST","Tax Ready"), ("Multi","Branch"),
         ("60","Day Trial"), ("24/7","Support")]
sw = W // len(stats)
for i,(num,lbl) in enumerate(stats):
    sx = i*sw + sw//2
    if i > 0:
        draw.line([(i*sw, SY+18),(i*sw, SY+82)], fill=(50,35,90), width=1)
    # number with gradient-like effect (draw twice with offset)
    bb = draw.textbbox((0,0), num, font=bahn(36))
    nw = bb[2]-bb[0]
    nx = sx - nw//2
    draw.text((nx+1, SY+14), num, font=bahn(36), fill=PURPLE)
    draw.text((nx,   SY+13), num, font=bahn(36), fill=PURPLE2)
    ct_bb = draw.textbbox((0,0), lbl, font=fnt(13))
    lw = ct_bb[2]-ct_bb[0]
    draw.text((sx - lw//2, SY+62), lbl, font=fnt(13), fill=GREY2)

# ── FOOTER ────────────────────────────────────────────────────────────────────
FY = SY + 118

# bg
v_grad(0, FY, W, H, (14,6,36), (8,4,22))

# Decorative circles
draw.ellipse([W//2-260, FY+10, W//2+260, FY+10+520],
             outline=(50,30,100), fill=None)
draw.ellipse([W//2-180, FY+50, W//2+180, FY+50+440],
             outline=(40,20,80), fill=None)

# CTA button (gradient)
BTX1, BTY1, BTX2, BTY2 = W//2-220, FY+40, W//2+220, FY+100
h_grad(BTX1, BTY1, BTX2, BTY2, PURPLE, CYAN)
rr(BTX1, BTY1, BTX2, BTY2, 30, fill=None, outline=WHITE, ow=1)
# button text
ct(FY+52, "Start Your Free Trial Today", bahn(28), WHITE)

# Separator line
sep_y = FY + 128
h_grad(W//2-300, sep_y, W//2+300, sep_y+2, (0,0,0), PURPLE)
h_grad(W//2-300, sep_y, W//2+300, sep_y+2, PURPLE, (0,0,0))

# Contact block
ct(FY+146, "Sathish", bahn(44), GOLD2)
ct(FY+198, "+91 79042 63246", bahn(32), WHITE)
ct(FY+238, "haappiibilling@gmail.com", fnt(30, True), CYAN)
ct(FY+274, "Instagram: @sathish_sk52", fnt(28, True), WHITE)
ct(FY+308, "www.haappiibilling.in", bahn(34), CYAN)

# Small divider dots
for i,dc in enumerate(ACCENTS):
    dx = W//2 - 50 + i*20
    draw.ellipse([dx-4, FY+352, dx+4, FY+360], fill=dc)

# Tagline
ct(FY+368, "Haappii Billing  -  Simple. Fast. Smart.", fnt(18), GREY2)

# ── CORNER DECORATIONS ───────────────────────────────────────────────────────
for i, c in enumerate([(130,60,255),(0,200,255),(40,220,130)]):
    r = 6 - i*2
    draw.ellipse([W-55+i*18, FY+40, W-55+i*18+r*2, FY+40+r*2], fill=c)

# ── SAVE ─────────────────────────────────────────────────────────────────────
# slight sharpening
from PIL import ImageEnhance
img = ImageEnhance.Sharpness(img).enhance(1.15)

out = "C:/Users/sathi/Desktop/ShopApp/shop-billing-app/docs/HaappiiBilling_Social_Poster.png"
img.save(out, "PNG")
print(f"Saved -> {out}  ({W}x{H})")
