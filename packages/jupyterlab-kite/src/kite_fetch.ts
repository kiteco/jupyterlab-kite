const kiteLocalHost = 'http://localhost:46624';

export async function POST(url = '', data = {}) {
  if (url.startsWith('/')) {
    url = kiteLocalHost + url;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    mode: 'no-cors',
    body: JSON.stringify(data)
  });
  return response;
}
