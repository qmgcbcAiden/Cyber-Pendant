export function extractSnFromScan(rawValue) {
  console.log('[Scanner] Extract SN from raw value:', rawValue);
  const value = String(rawValue || '').trim();

  if (!value) {
    console.log('[Scanner] Empty value, returning empty string');
    return '';
  }

  try {
    const url = new URL(value);
    const sn = (
      url.searchParams.get('sn') ||
      url.hash.match(/[?&]sn=([^&]+)/)?.[1] ||
      value
    ).toUpperCase();
    console.log('[Scanner] Extracted SN (URL method):', sn);
    return sn;
  } catch {
    const match = value.match(/[?&]sn=([^&]+)/);
    const sn = decodeURIComponent(match?.[1] || value).toUpperCase();
    console.log('[Scanner] Extracted SN (regex method):', sn);
    return sn;
  }
}

export async function scanWithPlatform() {
  console.log('[Scanner] scanWithPlatform called');
  // #ifdef MP-WEIXIN
  console.log('[Scanner] WeChat mini program platform, calling uni.scanCode');
  return new Promise((resolve, reject) => {
    console.log('[Scanner] Starting scan code...');
    uni.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success(result) {
        console.log('[Scanner] Scan success:', result);
        resolve(extractSnFromScan(result.result));
      },
      fail(error) {
        console.log('[Scanner] Scan failed:', error);
        reject(new Error(error.errMsg || '扫码失败'));
      }
    });
  });
  // #endif

  // #ifndef MP-WEIXIN
  console.log('[Scanner] Non-WeChat platform, throwing error');
  throw new Error('当前平台请使用页面内摄像头扫码或手动输入 SN');
  // #endif
}
