import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './index.css';

function App() {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
      .then((text) => {
        setContent(text);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load README.md:', err);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="container">
      <main className={`markdown-body ${!isLoading ? 'loaded' : ''}`}>
        {!isLoading && <ReactMarkdown>{content}</ReactMarkdown>}
      </main>

      {!isLoading && (
        <footer className="footer">
          <p>
            © {new Date().getFullYear()} uwayss.com •{' '}
            <a
              href="https://github.com/uwayss/uwayss.com"
              target="_blank"
              rel="noopener noreferrer">
              Source
            </a>
          </p>
        </footer>
      )}
    </div>
  );
}

export default App;
