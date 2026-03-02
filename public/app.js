(function(){
  // Gentle invalid shake
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', (e) => {
      const invalid = [...form.querySelectorAll('input,select,textarea')].find(el => !el.checkValidity());
      if (invalid) {
        invalid.classList.add('shake');
        setTimeout(()=>invalid.classList.remove('shake'), 450);
      }
    });
  });

  // Category card radio/select sync for submit page
  const catCards = document.querySelectorAll('[data-cat]');
  const catSelect = document.querySelector('select[name="category"]');
  if (catCards.length && catSelect) {
    const sync = (value) => {
      catCards.forEach(c => c.classList.toggle('active', c.dataset.cat === value));
      catSelect.value = value;
    };
    catCards.forEach(c => c.addEventListener('click', () => sync(c.dataset.cat)));
    sync(catSelect.value);
  }

  // Confetti for success page
  const confettiCanvas = document.getElementById('confetti');
  if (confettiCanvas) {
    const ctx = confettiCanvas.getContext('2d');
    const w = confettiCanvas.width = window.innerWidth;
    const h = confettiCanvas.height = 280;
    const pieces = Array.from({length: 120}, () => ({
      x: Math.random()*w,
      y: -Math.random()*h,
      r: 4 + Math.random()*5,
      d: 2 + Math.random()*3,
      c: ['#6ea8fe','#ff7d6b','#7cf29a','#ffd166','#c7b3ff'][Math.floor(Math.random()*5)],
      t: Math.random()*Math.PI*2
    }));
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0,0,w,h);
      pieces.forEach(p => {
        p.y += p.d;
        p.x += Math.sin(p.t + frame/16);
        p.t += .02;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x,p.y,p.r,p.r*0.6);
      });
      frame++;
      if (frame < 220) requestAnimationFrame(draw);
    };
    draw();
  }
})();