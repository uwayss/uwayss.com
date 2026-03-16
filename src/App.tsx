import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './index.css';

function App() {
  const [content, setContent] = useState('');

  useEffect(() => {
    // Tracking UTM parameters
    const params = new URLSearchParams(window.location.search);
    const utm_source = params.get('utm_source');
    const utm_medium = params.get('utm_medium');
    const utm_content = params.get('utm_content');

    fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        utm_source,
        utm_medium,
        utm_content,
        path: window.location.pathname,
      }),
    }).catch((err) => console.error('Tracking failed:', err));

    fetch('/README.md')
      .then((res) => res.text())
      .then((text) => setContent(text))
      .catch((err) => console.error('Failed to load README.md:', err));
  }, []);

  return (
    <main className="markdown-body">
      <ReactMarkdown>{content}</ReactMarkdown>
    </main>
  );
}

export default App;
