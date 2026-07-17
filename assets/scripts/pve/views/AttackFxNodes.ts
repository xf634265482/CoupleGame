/**
 * 程序化攻击表现：箭矢弹道 / 剑弧光 / 命中爆点。
 * 不依赖额外美术资源；由 ExpeditionController 托管生命周期（登记 ghost 集）。
 */
import { Color, Graphics, Node, UIOpacity, UITransform, Vec3 } from 'cc';

const ARROW_COLOR = new Color(255, 230, 160, 255);
const ARROW_CORE = new Color(255, 248, 210, 220);
const ARROW_OUTLINE = new Color(200, 140, 50, 230);
const ARROW_FEATHER = new Color(220, 100, 55, 240);
const TRAIL_COLOR = new Color(255, 200, 110, 160);
const IMPACT_RING = new Color(255, 220, 140, 200);
const IMPACT_CORE = new Color(255, 255, 240, 180);
const SLASH_COLOR = new Color(255, 245, 210, 210);
const SLASH_CORE = new Color(255, 255, 255, 160);
const SABER_BLADE = new Color(160, 220, 255, 230);
const SABER_CORE = new Color(240, 250, 255, 255);
const SABER_EDGE = new Color(90, 170, 255, 220);
const SABER_HILT = new Color(70, 80, 95, 255);

function ensureUi(node: Node, w: number, h: number): void {
  const ut = node.getComponent(UITransform) ?? node.addComponent(UITransform);
  ut.setContentSize(w, h);
}

/** 沿本地 +X 的醒目箭矢（粗杆 + 亮芯，无外晕）。 */
export function createArrowFxNode(parent: Node): Node {
  const node = new Node('ArrowFx');
  node.setParent(parent);
  ensureUi(node, 76, 28);
  node.addComponent(UIOpacity).opacity = 255;
  const g = node.addComponent(Graphics);

  // 箭杆
  g.lineWidth = 2;
  g.strokeColor = ARROW_OUTLINE;
  g.fillColor = ARROW_COLOR;
  g.rect(-24, -4, 36, 8);
  g.fill();
  g.stroke();

  // 亮芯
  g.fillColor = ARROW_CORE;
  g.rect(-18, -1.5, 26, 3);
  g.fill();

  // 箭头
  g.fillColor = ARROW_COLOR;
  g.moveTo(10, 0);
  g.lineTo(28, 9);
  g.lineTo(28, -9);
  g.close();
  g.fill();
  g.stroke();

  // 箭羽
  g.fillColor = ARROW_FEATHER;
  g.moveTo(-24, 0);
  g.lineTo(-34, 8);
  g.lineTo(-28, 0);
  g.lineTo(-34, -8);
  g.close();
  g.fill();
  return node;
}

/** 弹道拖尾残影：短亮条，沿飞行方向拉伸。 */
export function createArrowTrailFxNode(parent: Node): Node {
  const node = new Node('ArrowTrailFx');
  node.setParent(parent);
  ensureUi(node, 40, 14);
  node.addComponent(UIOpacity).opacity = 140;
  const g = node.addComponent(Graphics);
  g.fillColor = TRAIL_COLOR;
  g.ellipse(0, 0, 16, 4);
  g.fill();
  return node;
}

/** 命中爆点：外环 + 十字闪光。 */
export function createRangedImpactFxNode(parent: Node, radius = 36): Node {
  const node = new Node('RangedImpactFx');
  node.setParent(parent);
  ensureUi(node, radius * 2 + 12, radius * 2 + 12);
  node.addComponent(UIOpacity).opacity = 220;
  const g = node.addComponent(Graphics);

  g.strokeColor = IMPACT_RING;
  g.lineWidth = 3;
  g.circle(0, 0, radius * 0.65);
  g.stroke();

  g.strokeColor = IMPACT_CORE;
  g.lineWidth = 2;
  const arm = radius * 0.7;
  g.moveTo(-arm, 0);
  g.lineTo(arm, 0);
  g.stroke();
  g.moveTo(0, -arm);
  g.lineTo(0, arm);
  g.stroke();

  g.fillColor = IMPACT_CORE;
  g.circle(0, 0, 3.5);
  g.fill();
  return node;
}

/** 面向目标的剑弧（扇形），本地朝 +X。 */
export function createSwordArcFxNode(parent: Node, radius: number): Node {
  const node = new Node('SwordArcFx');
  node.setParent(parent);
  ensureUi(node, radius * 2 + 8, radius * 2 + 8);
  node.addComponent(UIOpacity).opacity = 255;
  const g = node.addComponent(Graphics);
  // 外弧光带
  g.fillColor = SLASH_COLOR;
  g.moveTo(0, 0);
  const start = -Math.PI * 0.55;
  const end = Math.PI * 0.55;
  const steps = 14;
  for (let i = 0; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    g.lineTo(Math.cos(t) * radius, Math.sin(t) * radius);
  }
  g.close();
  g.fill();
  // 内芯亮边
  g.strokeColor = SLASH_CORE;
  g.lineWidth = 3;
  g.moveTo(Math.cos(start) * (radius * 0.35), Math.sin(start) * (radius * 0.35));
  for (let i = 1; i <= steps; i += 1) {
    const t = start + ((end - start) * i) / steps;
    g.lineTo(Math.cos(t) * radius, Math.sin(t) * radius);
  }
  g.stroke();
  return node;
}

/**
 * 近战光剑：柄在原点，刃沿本地 +X。
 * 无外晕；靠刃身对比与挥砍动作本身可读。
 */
export function createLightSaberFxNode(parent: Node, length = 52): Node {
  const bladeLen = Math.max(36, length);
  const node = new Node('LightSaberFx');
  node.setParent(parent);
  ensureUi(node, bladeLen + 24, 28);
  node.addComponent(UIOpacity).opacity = 255;
  const g = node.addComponent(Graphics);

  // 护手
  g.fillColor = SABER_HILT;
  g.rect(-6, -7, 10, 14);
  g.fill();
  // 柄
  g.rect(-18, -3.5, 14, 7);
  g.fill();

  // 刃身外沿
  g.fillColor = SABER_EDGE;
  g.rect(2, -4, bladeLen, 8);
  g.fill();
  // 刃尖
  g.moveTo(2 + bladeLen, -4);
  g.lineTo(2 + bladeLen + 10, 0);
  g.lineTo(2 + bladeLen, 4);
  g.close();
  g.fill();

  // 刃芯
  g.fillColor = SABER_BLADE;
  g.rect(4, -2.5, bladeLen - 2, 5);
  g.fill();
  g.fillColor = SABER_CORE;
  g.rect(6, -1, bladeLen - 6, 2);
  g.fill();
  return node;
}

/**
 * 挥砍光晕拖尾：单层扇形光晕，随挥砍角连续重绘（不是多道影子残影）。
 * 返回 paint(fromDeg, toDeg) 用枢轴本地角（与光剑 angle 同坐标系）。
 */
export function createSaberSwingGlowNode(
  parent: Node,
  radius: number,
): { node: Node; paint: (fromDeg: number, toDeg: number) => void } {
  const r = Math.max(36, radius);
  const node = new Node('SaberSwingGlow');
  node.setParent(parent);
  ensureUi(node, r * 2 + 16, r * 2 + 16);
  node.addComponent(UIOpacity).opacity = 255;
  const g = node.addComponent(Graphics);

  const paint = (fromDeg: number, toDeg: number): void => {
    g.clear();
    const a0 = Math.min(fromDeg, toDeg) * (Math.PI / 180);
    const a1 = Math.max(fromDeg, toDeg) * (Math.PI / 180);
    if (a1 - a0 < 0.02) return;
    const inner = r * 0.18;
    const mid = r * 0.62;
    const outer = r * 0.98;
    const steps = Math.max(10, Math.ceil((a1 - a0) / (Math.PI / 36)));

    // 外层淡光晕
    g.fillColor = new Color(110, 190, 255, 55);
    g.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    for (let i = 0; i <= steps; i += 1) {
      const t = a0 + ((a1 - a0) * i) / steps;
      g.lineTo(Math.cos(t) * outer, Math.sin(t) * outer);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const t = a0 + ((a1 - a0) * i) / steps;
      g.lineTo(Math.cos(t) * inner, Math.sin(t) * inner);
    }
    g.close();
    g.fill();

    // 中带稍亮光带（刀锋扫过感）
    g.fillColor = new Color(190, 230, 255, 80);
    g.moveTo(Math.cos(a0) * mid, Math.sin(a0) * mid);
    for (let i = 0; i <= steps; i += 1) {
      const t = a0 + ((a1 - a0) * i) / steps;
      g.lineTo(Math.cos(t) * outer, Math.sin(t) * outer);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const t = a0 + ((a1 - a0) * i) / steps;
      g.lineTo(Math.cos(t) * mid, Math.sin(t) * mid);
    }
    g.close();
    g.fill();
  };

  return { node, paint };
}

export function aimNodeToward(node: Node, from: Vec3, to: Vec3): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
  node.setRotationFromEuler(0, 0, angle);
}

export function midPoint(a: Vec3, b: Vec3, bias = 0.45): Vec3 {
  return new Vec3(
    a.x + (b.x - a.x) * bias,
    a.y + (b.y - a.y) * bias,
    0,
  );
}
