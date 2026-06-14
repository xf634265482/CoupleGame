import { Vec3 } from 'cc';
import { visibleDesignSize } from '../../platform/wechat/ViewAdapt';

export type BoardUiLayout = {
  screenW: number;
  screenH: number;
  leftW: number;
  rightW: number;
  topH: number;
  bottomH: number;
  boardCenter: Vec3;
  playersCenter: Vec3;
  sideCenter: Vec3;
  sideButtonCenter: Vec3;
  sideButtonZoneH: number;
  sideLogCenter: Vec3;
  sideLogZoneH: number;
};

function screenSize(): { w: number; h: number } {
  return visibleDesignSize();
}

let loggedLayout = false;

/** 横版布局：底部玩家信息栏需要足够高度承载 HP/资源/装备槽 */
export function boardUiLayout(): BoardUiLayout {
  const { w: screenW, h: screenH } = screenSize();
  const leftW = Math.round(screenW * 0.76);
  const rightW = screenW - leftW;
  const bottomH = Math.round(screenH * 0.3);
  const topH = screenH - bottomH;

  const leftX = -screenW / 2 + leftW / 2;
  const rightX = screenW / 2 - rightW / 2;
  const topY = screenH / 2 - topH / 2;
  const bottomY = -screenH / 2 + bottomH / 2;

  const sidePad = 4;
  const btnH = 44;
  const btnGap = 3;
  const btnCount = 5;
  const btnBlockH = btnCount * btnH + (btnCount - 1) * btnGap;
  const railTop = screenH / 2 - sidePad;
  const railBottom = -screenH / 2 + sidePad;
  const btnTopInset = 72;
  const btnCenterY = railTop - btnTopInset - btnBlockH / 2;
  const btnBottomY = btnCenterY - btnBlockH / 2;
    const logGapBelowButtons = 6;
    const logBottomY = railBottom + 2;
    const logTopY = btnBottomY - logGapBelowButtons;
    const maxLogH = logTopY - logBottomY;
    const logH = Math.max(160, maxLogH);
  const logCenterY = logBottomY + logH / 2;
  if (!loggedLayout) {
    loggedLayout = true;
    console.log('[BoardUiLayout]', 'sideLogZoneH', logH, 'sideButtonCount', btnCount);
  }

  return {
    screenW,
    screenH,
    leftW,
    rightW,
    topH,
    bottomH,
    boardCenter: new Vec3(leftX, topY, 0),
    playersCenter: new Vec3(leftX, bottomY, 0),
    sideCenter: new Vec3(rightX, topY, 0),
    sideButtonCenter: new Vec3(rightX, btnCenterY, 0),
    sideButtonZoneH: btnBlockH + 8,
    sideLogCenter: new Vec3(rightX, logCenterY, 0),
    sideLogZoneH: logH,
  };
}
