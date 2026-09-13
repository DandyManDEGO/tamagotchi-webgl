// Worker перед статичними файлами білда.
//
// Навіщо він, якщо є _headers: Cloudflare стискає відповіді на льоту. Коли
// файл уже стиснений Unity (.br), edge стискає його brotli ще раз, браузер
// знімає лише цей зовнішній шар — і лоадер Unity отримує сирий brotli-контейнер
// («Unable to parse framework.js.br»). Єдиний спосіб сказати Cloudflare
// «тіло вже закодоване, не чіпай» — повернути Response з encodeBody: "manual"
// із Worker-скрипта. Для всього іншого (index.html, loader.js) Worker просто
// віддає ассет як є.
//
// Файл даних (.data.br) перевищує ліміт 25 MiB на статичний ассет, тому лежить
// у бакеті R2 (біндінг BUILD) під тим самим шляхом, що й у білді: Build/<hash>.data.br.
// Порядок: спершу ассети, і лише якщо там 404 — R2. Так дрібні .br (framework,
// wasm) далі роздаються з ассетів, а index.html не знає про R2 взагалі.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);

    if (!url.pathname.endsWith(".br")) {
      return response;
    }

    let body;
    let headers;
    if (response.status === 200) {
      // Тіло читається цілком, а не передається потоком: для потоку невідомої
      // довжини runtime не ставить Content-Length, а без нього лоадер Unity не
      // показує відсотків (кільце стоїть на 0% до кінця) і не може перевіряти
      // кеш за розміром. 26 МБ у памʼяті Worker-а — далеко від ліміту 128 МБ.
      body = await response.arrayBuffer();
      headers = new Headers(response.headers);
    } else if (response.status === 404) {
      const object = await env.BUILD.get(url.pathname.slice(1));
      if (!object) {
        return response;
      }
      body = await object.arrayBuffer();
      headers = new Headers();
      headers.set("ETag", object.httpEtag);
    } else {
      return response;
    }

    headers.set("Content-Encoding", "br");
    headers.set("Content-Type", contentTypeFor(url.pathname));
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    return new Response(body, {
      status: 200,
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
