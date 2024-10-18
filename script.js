document.addEventListener('DOMContentLoaded', (event) => {
    console.log('Document is fully loaded');
  const startScore = 0;
  let score = startScore;

  const canvas = document.getElementById('game-screen');
  const ctx = canvas.getContext('2d');
  canvas.style.backgroundColor = '#222222';
  let ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 10,
    color: 'white',
    gravity: 0.2,
    bounce: 0.5,
    friction: 0.97,
    maxSpeed: 0.8 // Set a maximum speed for the ball
  };

  function drawBall() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear the canvas before drawing
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ball.color;
    ctx.fill();
    ctx.closePath();
  }

  drawBall();

  let dx = 0;
  let dy = 10;

  function updateBallPosition() {
    ball.x += dx;
    ball.y += dy;
    dy += ball.gravity; // Apply gravity to the vertical velocity

    // Check for collisions with the walls
    if (ball.x + ball.radius > canvas.width) {
      ball.x = canvas.width - ball.radius; // Correct position
      dx = -dx * ball.friction; // Apply friction when bouncing off the walls
    } else if (ball.x - ball.radius < 0) {
      ball.x = ball.radius; // Correct position
      dx = -dx * ball.friction; // Apply friction when bouncing off the walls
    }
    // Apply friction when rolling on the ground
    if (ball.y + ball.radius >= canvas.height) {
      dx *= ball.friction;
    }
    if (ball.y + ball.radius > canvas.height) {
      dy = -dy * ball.bounce; // Apply bounce factor when hitting the floor
      ball.y = canvas.height - ball.radius; // Prevent the ball from getting stuck
    }
    // Stop bouncing if the bounce isn't enough
    if (ball.y + ball.radius >= canvas.height && Math.abs(dy) < 1) {
      dy = 0;
    }
  }

  function updateAnimation() {
    updateBallPosition();
    drawBall();
    requestAnimationFrame(updateAnimation);
  }

  // when the mouse is over the ball , it will jump
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const distance = Math.sqrt((mouseX - ball.x) ** 2 + (mouseY - ball.y) ** 2);

    if (distance <= ball.radius * 1.5) { // Increase the hitbox size by 50%
      dy = -13; // Give the ball a positive y speed
      if (!ball.lastSoundTime || Date.now() - ball.lastSoundTime > 60) {
        const audio = new Audio(`sounds/ping pong sounds 1-ping-pong-64516.mp3`);
        audio.play();
        ball.lastSoundTime = Date.now();
      }
      dx = -(mouseX - ball.x) / 15; // Set dx based on the distance of the mouse position relative to the ball
    }
  });

  // Ensure the canvas can be clicked even when the ball is moving
  canvas.addEventListener('mousemove', (event) => {
    canvas.style.cursor = 'default';
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const distance = Math.sqrt((mouseX - ball.x) ** 2 + (mouseY - ball.y) ** 2);

    if (distance <= ball.radius) {
      canvas.style.cursor = 'pointer';
    }
  });

    updateAnimation();


    document.getElementById('mute-click').addEventListener('click', () => {
      const muteButton = document.getElementById('mute-click');
      const isMuted = muteButton.getAttribute('data-muted') === 'true';
      muteButton.setAttribute('data-muted', !isMuted);
      muteButton.innerHTML = !isMuted ? 'Unmute' : 'Mute';

      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.muted = !audio.muted;
      });

      const icon = document.getElementById('mute-icon');
      icon.src = !isMuted ? 'icons/sound-loud-svgrepo-com.svg' : 'icons/sound-mute-svgrepo-com.svg';
    });

  });
