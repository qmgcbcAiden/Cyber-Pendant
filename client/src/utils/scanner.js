export function extractSnFromScan(rawValue) {
  console.log('[Scanner] Extract SN from raw value:', rawValue);
  const value = String(rawValue || '').trim();

  if (!value) {
    console.log('[Scanner] Empty value, returning empty string');
    return '';
  }

  const sn = resolveSnCandidate(value).toUpperCase();
  console.log('[Scanner] Extracted SN:', sn);
  return sn;
}

/**
 * 检查扫码结果是否为空或无效
 * @param {string} result - 扫码结果
 * @returns {object} - { valid: boolean, reason: string }
 */
export function validateScanResult(result) {
  const value = String(result || '').trim();

  if (!value) {
    return {
      valid: false,
      reason: '扫码结果为空，请重试或手动输入 SN 码。'
    };
  }

  return { valid: true };
}

function resolveSnCandidate(value, depth = 0) {
  const candidate = extractSnCandidate(value);
  const decoded = safeDecodeURIComponent(candidate);

  if (depth < 3 && decoded !== value && /(?:^|[?&#\s])(?:sn|scene)=/i.test(decoded)) {
    return resolveSnCandidate(decoded, depth + 1);
  }

  return decoded.trim();
}

function extractSnCandidate(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  try {
    const url = new URL(text);
    return (
      url.searchParams.get('sn') ||
      url.searchParams.get('scene') ||
      extractNamedParameter(url.hash) ||
      text
    );
  } catch {
    return extractNamedParameter(text) || extractEmbeddedSn(text) || text;
  }
}

function extractNamedParameter(value) {
  const match = String(value || '').match(/(?:^|[?&#\s])(?:sn|scene)=([^&#\s]+)/i);
  return match?.[1] || '';
}

function extractEmbeddedSn(value) {
  const match = String(value || '').match(/\bCP[A-Z0-9]{10,20}\b/i);
  return match?.[0] || '';
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || '').trim());
  } catch {
    return String(value || '').trim();
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
      scanType: ['qrCode', 'barCode', 'wxCode'],
      success(result) {
        console.log('[Scanner] Scan success:', result);

        // 优先使用 path 字段（扫描当前小程序二维码时会返回）
        if (result.path && typeof result.path === 'string') {
          console.log('[Scanner] Using path field from scan result:', result.path);
          resolve(extractSnFromScan(result.path));
        } else if (result.result && typeof result.result === 'string') {
          console.log('[Scanner] Using result field from scan result:', result.result);
          resolve(extractSnFromScan(result.result));
        } else {
          console.log('[Scanner] No valid scan result found');
          reject(new Error('扫码结果无效'));
        }
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
