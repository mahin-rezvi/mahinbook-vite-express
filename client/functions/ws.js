export function onRequest({ request, env }) {
  return env.MAHINBOOK_API.fetch(request);
}
