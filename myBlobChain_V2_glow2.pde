import geomerative.*;

import toxi.physics2d.constraints.*;
import toxi.physics2d.behaviors.*;
import toxi.physics2d.*;
import toxi.geom.*;

import java.util.List;

VerletPhysics2D physics;
AttractionBehavior2D fixedAttractor;

RShape font;
String input = "feliz cumplegonz";
int timeStayMs = 2000;
int startMs;

int lengthSegmentPoligonizer = 6;
Vec2D offset = new Vec2D(80, 390);

// ---- letters as particles -------------------------------------------------
VerletParticle2D[][] originalPathParticles;
VerletParticle2D[][] pathParticles;

// ---- visual (smoothed) positions ------------------------------------------
PVector[][] visual;

// ---- springs / behaviors --------------------------------------------------
List<VerletSpring2D>       outlineSprings     = new ArrayList<VerletSpring2D>();
List<VerletSpring2D>       originSprings      = new ArrayList<VerletSpring2D>();
List<AttractionBehavior2D> repulsionBehaviors = new ArrayList<AttractionBehavior2D>();
List<VerletParticle2D>     repulsionParticles = new ArrayList<VerletParticle2D>(); // parallel to repulsionBehaviors

float outlineSpringStrength = 0.1f;
float originSpringStrength  = 0.001f;
float repulsionStrength     = 10.0f;

// ---- global flags ---------------------------------------------------------
boolean attractToOrigin = true;
boolean modulateSprings = false;
boolean showCursor      = false;   // toggled by 'c'

// ---- render flags ---------------------------------------------------------
boolean renderOutlineSprings = true;
boolean renderOriginSprings  = false;

// ---- temporal modulation --------------------------------------------------
float modPeriodMs  = 10000;
float modMinFactor = 0.01f;
float modMaxFactor = 15.0f;

// ---- enzyme lens ----------------------------------------------------------
// The lens acts ONLY on origin springs, and only for particles whose
// CURRENT position is inside the lens. Neighbors follow through the
// outline springs. This is the "enzyme" behavior.
float lensRadius         = 180f;    // px
float lensSoftness       = 40f;     // px — width of the smooth border
float lensMidpointFrac   = 0.60f;   // where the sigmoid crosses 0.5 (fraction of radius)
float maxAnchorStrength  = 0.025f;  // peak origin spring strength at lens center
boolean lensEnabled      = true;
boolean showLensRing     = true;    // draw a faint ring so you can see the lens

// ---- visual smoothing -----------------------------------------------------
float visualLerp = 0.35f;

// ---- trail buffer ---------------------------------------------------------
PGraphics trail;
int trailFade = 30;

// ---- physics stepping -----------------------------------------------------
int physicsSubsteps = 2;


// ---------------------------------------------------------------------------
void setup() {
  size(1600, 720, P2D);
  smooth(4);
  colorMode(HSB, 100);
  noCursor();

  trail = createGraphics(width, height, JAVA2D);
  trail.beginDraw();
  trail.colorMode(HSB, 100);
  trail.background(0);
  trail.endDraw();

  initPhysics();

  startMs = millis();
  fixedAttractor = new AttractionBehavior2D(new Vec2D(width/2, height/2), 900, 0.06f);
}


// ---------------------------------------------------------------------------
void draw() {
  applyAttractToOrigin();
  applyEnzymeLens();          // <-- replaces applySpringModulation()

  for (int i = 0; i < physicsSubsteps; i++) physics.update();

  // smoothed visual positions
  if (visual != null && pathParticles != null) {
    for (int ii = 0; ii < pathParticles.length; ii++) {
      for (int i = 0; i < pathParticles[ii].length; i++) {
        VerletParticle2D p = pathParticles[ii][i];
        visual[ii][i].lerp(p.x, p.y, 0, visualLerp);
      }
    }
  }

  // 1. trail buffer
  trail.beginDraw();
  trail.blendMode(BLEND);
  trail.noStroke();
  trail.fill(0, 0, 0, trailFade);
  trail.rect(0, 0, width, height);
  trail.blendMode(ADD);
  drawAllPaths(trail, true);
  trail.blendMode(BLEND);
  trail.endDraw();

  // 2. composite to screen
  background(0);
  blendMode(ADD);
  image(trail, 0, 0);
  blendMode(BLEND);

  // 3. crisp core
  drawAllPaths(g, false);

  // 4. debug overlays
  if (renderOriginSprings) drawOriginSprings(g);

  // 5. lens indicator
  if (showLensRing && lensEnabled) drawLensRing(g);
}


// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

void drawAllPaths(PGraphics g, boolean glow) {
  if (pathParticles == null || visual == null) return;

  g.noFill();
  g.strokeCap(ROUND);
  g.strokeJoin(ROUND);

  for (int ii = 0; ii < visual.length; ii++) {
    PVector[] pts = visual[ii];
    if (pts == null || pts.length < 2) continue;

    float hue = (ii * 37) % 100;

    if (glow) {
      g.strokeWeight(9);
      g.stroke(hue, 90, 100, 12);
      drawPolyline(g, pts);

      g.strokeWeight(4.5f);
      g.stroke(hue, 90, 100, 28);
      drawPolyline(g, pts);
    } else {
      g.strokeWeight(1.4f);
      g.stroke(hue, 25, 100, 100);
      drawPolyline(g, pts);
    }
  }
}

void drawPolyline(PGraphics g, PVector[] pts) {
  g.beginShape();
  for (int i = 0; i < pts.length; i++) g.vertex(pts[i].x, pts[i].y);
  g.vertex(pts[0].x, pts[0].y);
  g.endShape();
}

void drawOriginSprings(PGraphics g) {
  g.strokeWeight(1);
  float indexCol = 0;
  for (VerletSpring2D s : originSprings) {
    g.stroke((indexCol + 50) % 100, 100, 100, 60);
    g.line(s.a.x, s.a.y, s.b.x, s.b.y);
    indexCol++;
  }
}

void drawLensRing(PGraphics g) {
  g.noFill();
  g.strokeWeight(1);
  g.stroke(0, 0, 85, 40);
  g.ellipse(mouseX, mouseY, lensRadius * 2, lensRadius * 2);
  // faint inner ring at the sigmoid midpoint, so the "core" is visible
  g.stroke(0, 0, 100, 25);
  g.ellipse(mouseX, mouseY, lensRadius * 2 * lensMidpointFrac,
                            lensRadius * 2 * lensMidpointFrac);
  g.strokeWeight(2);
  g.stroke(0, 0, 100, 70);
  g.point(mouseX, mouseY);
}


// ---------------------------------------------------------------------------
// Physics init
// ---------------------------------------------------------------------------

void initPhysics() {
  physics = new VerletPhysics2D();
  physics.setWorldBounds(new Rect(0, 0, width, height));
  physics.setDrag(0.4f);

  RG.init(this);
  RFont fnt = RG.loadFont("ReplicaBold.ttf");
  RG.textFont(fnt, 170);
  font = RG.getText(input);

  RG.setPolygonizer(RG.UNIFORMLENGTH);
  RG.setPolygonizerLength(lengthSegmentPoligonizer);

  RPoint[][] paths = font.getPointsInPaths();
  if (paths == null) return;

  originalPathParticles = new VerletParticle2D[paths.length][];
  pathParticles         = new VerletParticle2D[paths.length][];
  visual                = new PVector[paths.length][];

  originSprings.clear();
  outlineSprings.clear();
  repulsionBehaviors.clear();
  repulsionParticles.clear();

  for (int ii = 0; ii < paths.length; ii++) {
    RPoint[] points = paths[ii];
    originalPathParticles[ii] = new VerletParticle2D[points.length];
    pathParticles[ii]         = new VerletParticle2D[points.length];
    visual[ii]                = new PVector[points.length];

    for (int i = 0; i < points.length; i++) {
      VerletParticle2D anchor = new VerletParticle2D(
        points[i].x + offset.x, points[i].y + offset.y).lock();
      originalPathParticles[ii][i] = anchor;

      VerletParticle2D p = new VerletParticle2D(0, 0);
      physics.addParticle(p);
      pathParticles[ii][i] = p;

      visual[ii][i] = new PVector(anchor.x, anchor.y);

      // rest length 0 → particle seeks the anchor itself
      originSprings.add(new VerletSpring2D(p, anchor, 0, originSpringStrength));
    }
  }

  resetPositionsToOrigin();

  for (int ii = 0; ii < pathParticles.length; ii++) {
    VerletParticle2D[] pp = pathParticles[ii];
    for (int i = 0; i < pp.length; i++) {
      VerletParticle2D p = pp[i];

      AttractionBehavior2D rep = new AttractionBehavior2D(p, 30, -repulsionStrength, 0.01f);
      physics.addBehavior(rep);
      repulsionBehaviors.add(rep);
      repulsionParticles.add(p);

      if (i > 0) addOutlineSpring(pp[i-1], p);
    }
    if (pp.length > 1) addOutlineSpring(pp[0], pp[pp.length-1]);
  }

  applyAttractToOrigin();
  applyEnzymeLens();
}


void addOutlineSpring(VerletParticle2D a, VerletParticle2D b) {
  VerletSpring2D s = new VerletSpring2D(a, b, 1.1 * a.distanceTo(b), outlineSpringStrength);
  physics.addSpring(s);
  outlineSprings.add(s);
}


void resetPositionsToOrigin() {
  if (originalPathParticles == null || pathParticles == null) return;
  for (int ii = 0; ii < pathParticles.length; ii++) {
    for (int i = 0; i < pathParticles[ii].length; i++) {
      VerletParticle2D p = pathParticles[ii][i];
      p.set(originalPathParticles[ii][i]);
      p.clearVelocity();
      p.clearForce();
      if (visual != null) visual[ii][i].set(p.x, p.y);
    }
  }
  trail.beginDraw();
  trail.blendMode(BLEND);
  trail.noStroke();
  trail.fill(0, 0, 0, 255);
  trail.rect(0, 0, width, height);
  trail.endDraw();
}


// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

void applyAttractToOrigin() {
  if (originSprings.isEmpty()) return;

  boolean inPhysics = physics.springs.contains(originSprings.get(0));
  if (inPhysics == attractToOrigin) return;

  for (VerletSpring2D s : originSprings) {
    if (attractToOrigin) physics.addSpring(s);
    else                 physics.removeSpring(s);
  }
}


// ---------------------------------------------------------------------------
// Enzyme lens
// ---------------------------------------------------------------------------
//
// The lens modulates ONLY the origin springs. Its weight is computed from
// the CURRENT position of the moving particle (s.a), so only material
// physically inside the lens is pulled. Everything outside the lens keeps
// its baseline origin strength (usually ~0), so the letter forms as a
// local, propagated event rather than a global mask.
//
// Outline springs and repulsion are NOT touched here. They keep their
// temporal modulation, and they are what carry the pull from seeded
// particles to their neighbors in the loop.

void applyEnzymeLens() {
  // --- temporal factors for outline / repulsion only ----------------------
  float outlineFactor, repulsionFactor;
  if (modulateSprings) {
    float phase = TWO_PI * millis() / modPeriodMs;
    outlineFactor   = map(sin(phase), -1, 1, modMinFactor, modMaxFactor);
    repulsionFactor = outlineFactor;
  } else {
    outlineFactor = repulsionFactor = 1.0f;
  }

  // --- origin springs: driven by the lens ---------------------------------
  for (VerletSpring2D s : originSprings) {
    float activation = enzymeWeight(s.a.x, s.a.y);   // <-- particle, not anchor
    s.setStrength(maxAnchorStrength * activation);
  }

  // --- outline springs: temporal only -------------------------------------
  for (VerletSpring2D s : outlineSprings) {
    s.setStrength(outlineSpringStrength * outlineFactor);
  }

  // --- repulsion: temporal only -------------------------------------------
  for (int k = 0; k < repulsionBehaviors.size(); k++) {
    repulsionBehaviors.get(k).setStrength(-repulsionStrength * repulsionFactor);
  }
}


// Smoothstepped, normalized lens weight:
//   1 at the center, 0 at and beyond lensRadius, smooth in between.
float enzymeWeight(float x, float y) {
  if (!lensEnabled) return 0;

  // Ignore the lens when the cursor is off-window.
  if (mouseX < 0 || mouseX >= width ||
      mouseY < 0 || mouseY >= height) {
    return 0;
  }

  float radius   = max(1.0f, lensRadius);
  float softness = constrain(lensSoftness, 1.0f, radius);
  float d        = dist(x, y, mouseX, mouseY);

  if (d >= radius) return 0;

  float midpoint = radius * lensMidpointFrac;

  float value  = descendingSigmoid((d - midpoint) / softness);
  float centre = descendingSigmoid(-midpoint / softness);
  float edge   = descendingSigmoid((radius - midpoint) / softness);

  return constrain((value - edge) / (centre - edge), 0, 1);
}


float descendingSigmoid(float x) {
  return 1.0f / (1.0f + exp(constrain(x, -60, 60)));
}


// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

void mousePressed()  { /* lens is always active; nothing to do */ }
void mouseReleased() { /* nothing to do */ }
void mouseDragged()  { /* mouseX/mouseY are always live */ }

void keyPressed() {
  if (key == '0') { resetPositionsToOrigin(); startMs = millis(); }
  if (key == ' ') attractToOrigin = !attractToOrigin;
  if (key == 'c' || key == 'C') {
    showCursor = !showCursor;
    if (showCursor) cursor(); else noCursor();
  }
  if (key == 'm' || key == 'M') modulateSprings = !modulateSprings;
  if (key == 'l' || key == 'L') lensEnabled = !lensEnabled;
  if (key == 'r' || key == 'R') showLensRing = !showLensRing;
  if (key == '1') renderOutlineSprings = !renderOutlineSprings;
  if (key == '2') renderOriginSprings  = !renderOriginSprings;
  if (key == '[') trailFade = max(2,    trailFade - 5);
  if (key == ']') trailFade = min(255,  trailFade + 5);
  if (key == ',') visualLerp = max(0.05f, visualLerp - 0.05f);
  if (key == '.') visualLerp = min(0.9f,  visualLerp + 0.05f);
}
