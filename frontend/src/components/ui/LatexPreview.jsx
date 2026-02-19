import { useEffect, useMemo, useRef, useState } from 'react';

let mathJaxLoader;

const loadMathJax = () => {
  if (window.MathJax) return Promise.resolve(window.MathJax);

  if (!mathJaxLoader) {
    mathJaxLoader = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
      script.async = true;
      script.onload = () => resolve(window.MathJax);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  return mathJaxLoader;
};

function LatexPreview({ latex }) {
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);

  const hasLatex = useMemo(() => Boolean(latex && latex.trim()), [latex]);

  useEffect(() => {
    if (!hasLatex) return;

    let mounted = true;
    loadMathJax()
      .then(() => {
        if (!mounted) return;
        setReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setReady(false);
      });

    return () => {
      mounted = false;
    };
  }, [hasLatex]);

  useEffect(() => {
    if (!ready || !hasLatex || !window.MathJax || !containerRef.current) return;
    window.MathJax.typesetPromise([containerRef.current]).catch(() => {});
  }, [ready, hasLatex, latex]);

  if (!hasLatex) {
    return <p className="text-sm text-gray-500">Sin LaTeX para previsualizar.</p>;
  }

  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div ref={containerRef}>{`\\(${latex}\\)`}</div>
    </div>
  );
}

export default LatexPreview;
