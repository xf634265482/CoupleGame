/** 微信小游戏音频策略（真机静音键、混音） */
export function initWxAudioPolicy(): void {
  if (typeof wx === 'undefined' || typeof wx.setInnerAudioOption !== 'function') {
    return;
  }
  wx.setInnerAudioOption({
    obeyMuteSwitch: false,
    mixWithOther: true,
  });
  console.log('[WxAudio] setInnerAudioOption ok');
}

let audioUnlockBound = false;
let audioUnlockRun: (() => void) | null = null;

/**
 * 真机首屏无用户操作时 InnerAudio/WebAudio 会静音；首次触摸后重试播放。
 * 注意：wx.onTouchStart/End 注册的回调会在**每次**触摸时触发——一旦 BGM 真正起播，
 * 应调用 unbindWechatAudioUnlock() 解绑，避免每次点击都跑 unlock + clip 重置（噪音日志 + 多余 IO）。
 */
export function bindWechatAudioUnlock(onUnlock: () => void): void {
  if (audioUnlockBound || typeof wx === 'undefined') {
    return;
  }
  audioUnlockBound = true;
  audioUnlockRun = () => {
    console.log('[WxAudio] user touch — unlock audio');
    onUnlock();
  };
  if (typeof wx.onTouchStart === 'function') {
    wx.onTouchStart(audioUnlockRun);
  }
  if (typeof wx.onTouchEnd === 'function') {
    wx.onTouchEnd(audioUnlockRun);
  }
}

/** BGM 成功播放后调用，解绑 touch 监听以避免后续每次点击都触发 unlock 回调。 */
export function unbindWechatAudioUnlock(): void {
  if (!audioUnlockBound || typeof wx === 'undefined' || !audioUnlockRun) {
    return;
  }
  if (typeof wx.offTouchStart === 'function') {
    wx.offTouchStart(audioUnlockRun);
  }
  if (typeof wx.offTouchEnd === 'function') {
    wx.offTouchEnd(audioUnlockRun);
  }
  audioUnlockBound = false;
  audioUnlockRun = null;
  console.log('[WxAudio] touch unlock listener removed (BGM running)');
}
