export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Anagramcı</title>
  <link rel="stylesheet" href="/static/style.css">
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
</head>
<body>
  <nav>
    <a href="/" class="logo">Anagramcı</a>
    <a href="/settings">Ayarlar</a>
  </nav>
  <main>${body}</main>
</body>
</html>`;
}
