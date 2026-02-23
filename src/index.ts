const server = Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response("anagramci is running");
  },
});

console.log(`Server running at http://localhost:${server.port}`);
