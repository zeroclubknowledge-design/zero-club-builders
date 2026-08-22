export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Zero Club</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#f4f2ef" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #f4f2ef; color: #171419; display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.25rem; }
      .card { max-width: 24rem; width: 100%; text-align: center; padding: 2.25rem 1.75rem 1.75rem; border: 1px solid #ded9d5; border-radius: 1.75rem; background: #fff; box-shadow: 0 24px 70px -42px rgba(0,0,0,.55); }
      img { width: 3.5rem; height: 3.5rem; border-radius: 1.1rem; }
      .brand { margin: 1rem 0 .35rem; color: #cc208f; font-size: .65rem; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; }
      h1 { font-size: 1.35rem; letter-spacing: -.02em; margin: 0 0 0.5rem; }
      p { color: #706a72; margin: 0 0 1.5rem; font-size: .85rem; }
      .actions { display: grid; gap: 0.6rem; }
      a, button { display: grid; place-items: center; min-height: 2.75rem; padding: 0.65rem 1rem; border-radius: .8rem; font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #cc208f; color: #fff; }
      .secondary { background: #fff; color: #171419; border-color: #ded9d5; }
    </style>
  </head>
  <body>
    <div class="card">
      <img src="/icons/icon-192.png" alt="" />
      <div class="brand">Zero Club</div>
      <h1>This page couldn't open</h1>
      <p>Check your connection and try again. Your account and work are safe.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/app">Return to feed</a>
      </div>
    </div>
  </body>
</html>`;
}
