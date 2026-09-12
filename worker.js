// Worker перед статичними файлами білда.
//
// Навіщо він, якщо є _headers: Cloudflare стискає відповіді на льоту. Коли
// файл уже стиснений Unity (.br), edge стискає його brotli ще раз, браузер
// знімає лише цей зовнішній шар — і лоадер Unity отримує сирий brotli-контейнер
// («Unable to parse framework.js.br»). Єдиний спосіб сказати Cloudflare
// «тіло вже закодоване, не чіпай» — повернути Response з encodeBody: "manual"
// із Worker-скрипта. Для всього іншого (index.html, loader.js) Worker просто
// віддає ассет як є.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (!url.pathname.endsWith(".br") || response.status !== 200) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Encoding", "br");
    headers.set("Content-Type", contentTypeFor(url.pathname));
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(response.body, {
      status: response.status,
      headers,
      encodeBody: "manual",
    });
  },
};

// Content-Type за розширенням до .br: для .wasm.br саме application/wasm
// вмикає потокову компіляцію wasm у браузері.
function contentTypeFor(pathname) {
  if (pathname.endsWith(".wasm.br")) return "application/wasm";
  if (pathname.endsWith(".js.br")) return "application/javascript";
  return "application/octet-stream";
}
