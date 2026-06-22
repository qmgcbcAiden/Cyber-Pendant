export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8787';

// Debug: Log when API module is loaded
console.log('[API Init] ==================== API Module Loaded ====================');
console.log('[API Init] API_BASE_URL =', API_BASE_URL);
console.log('[API Init] Environment mode =', import.meta.env.MODE);
console.log('[API Init] All env vars:', import.meta.env);
console.log('[API Init] ============================================================');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      ...(options.header || {})
    };

    const fullUrl = `${API_BASE_URL}${path}`;
    console.log('[API Request] ------------------ Request Started ------------------');
    console.log('[API Request] URL:', fullUrl);
    console.log('[API Request] Method:', options.method || 'GET');
    console.log('[API Request] Data:', options.data);
    console.log('[API Request] Headers:', headers);

    uni.request({
      url: fullUrl,
      method: options.method || 'GET',
      data: options.data,
      header: headers,
      success(response) {
        console.log('[API Response] ---------------- Request Success ----------------');
        console.log('[API Response] Status code:', response.statusCode);
        console.log('[API Response] Data:', response.data);
        const ok = response.statusCode >= 200 && response.statusCode < 300;
        if (ok) {
          resolve(response.data);
          return;
        }

        console.log('[API Response] Status error, rejecting...');
        reject({
          statusCode: response.statusCode,
          message: response.data?.message || '请求失败',
          data: response.data
        });
      },
      fail(error) {
        console.log('[API Request] ----------------- Request Failed ----------------');
        console.log('[API Request] Error:', error);
        console.log('[API Request] Error message:', error.errMsg);
        reject({
          statusCode: 0,
          message: error.errMsg || '网络连接失败'
        });
      }
    });
  });
}

export function getPublicGarment(sn, options = {}) {
  const suffix = options.track === false ? '?track=0' : '';
  return request(`/api/garments/${encodeURIComponent(sn)}${suffix}`);
}

export function bindPublicGarment(sn, data) {
  return request(`/api/garments/${encodeURIComponent(sn)}/binding`, {
    method: 'POST',
    data
  });
}

export function qrcodeUrl(sn, type = 'url') {
  return `${API_BASE_URL}/api/qrcode/${encodeURIComponent(sn)}?type=${type}`;
}
