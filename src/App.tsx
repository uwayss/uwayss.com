import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import './index.css';

function App() {
  const [content, setContent] = useState('');

  useEffect(() => {
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
