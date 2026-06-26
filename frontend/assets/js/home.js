// home.js — demo animation cycling through ASL letters
(function() {
  const letters = 'ABCDEFGHIKLMNOPQRSTUVWXY'.split('');
  const confs   = [94, 97, 89, 96, 92, 98, 91, 95, 88, 93, 97, 90, 96, 85, 94, 92, 97, 89, 95, 91, 93, 88, 96, 92];
  const el      = document.getElementById('demoLetter');
  if (!el) return;

  let i = 0;
  setInterval(() => {
    i = (i + 1) % letters.length;
    el.textContent = letters[i];
    el.style.transform = 'scale(1.2)';
    el.style.opacity = '0.5';
    setTimeout(() => {
      el.style.transform = 'scale(1)';
      el.style.opacity = '1';
    }, 150);
    const confEl = document.querySelector('.output__conf');
    if (confEl) confEl.textContent = `${confs[i] || 94}% confidence`;
  }, 1800);

  // Intersection observer for feature cards
  const cards = document.querySelectorAll('.feature-card');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, idx) => {
      if (entry.isIntersecting) {
        entry.target.style.animationDelay = `${idx * 0.1}s`;
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });
  cards.forEach(c => obs.observe(c));
})();
