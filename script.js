document.addEventListener('DOMContentLoaded', (event) => {
  const startScore = -1;
  let SCORE = startScore;
  const scoreElement = document.getElementById('score');

  const canvas = document.getElementById('game-screen');
  const ctx = canvas.getContext('2d');
  canvas.style.backgroundColor = '#222222';
  let ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 60,
    color: 'white',
    gravity: 0.2,
    bounce: 0.5,
    friction: 0.0, // Set a friction factor to slow down the ball
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
      dx = -dx; // Change direction
    } else if (ball.x - ball.radius < 0) {
      ball.x = ball.radius; // Correct position
      dx = -dx; // Change direction
    }
    // Apply friction when rolling on the ground
    if (ball.y + ball.radius >= canvas.height) {
      dx *= ball.friction;
    }
    if (ball.y + ball.radius > canvas.height) {
      dy = -dy * ball.bounce; // Apply bounce factor when hitting the floor
      SCORE = startScore; // Reset the score

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


  function ballHit() {
  }

  // when the mouse is over the ball , it will jump
//  canvas.addEventListener('mousedown', (event) => {
//    const rect = canvas.getBoundingClientRect();
//    const mouseX = event.clientX - rect.left;
//    const mouseY = event.clientY - rect.top;
//
//    const distance = Math.sqrt((mouseX - ball.x) ** 2 + (mouseY - ball.y) ** 2);
//
//    if (distance <= ball.radius * 1.05 && !ball.isJumping) { // Increase the hitbox size by 5%
//      ballHit();
//      dy = -14; // Give the ball a positive y speed
//      const audio = new Audio(`sounds/ping pong sounds 1-ping-pong-64516.mp3`);
//      SCORE++;
//      if (SCORE > 0) scoreElement.innerText = SCORE;
//      /* audio.play(); */ // Need to be fixed
//      randomNumber = Math.floor(Math.random() * 2) + 1;
//      dx = -(mouseX - ball.x)*randomNumber / 10; // Set dx based on the distance of the mouse position relative to the ball (lower value = pushed more to the sides)
//
//      ball.isJumping = true; // Set the jumping flag to true
//      setTimeout(() => {
//      ball.isJumping = false; // Reset the jumping flag after a delay
//      }, 200); // Adjust the delay as needed
//    }
//  });

  updateAnimation();

  let intervalId;

  document.addEventListener('mousedown', (event) => {
    document.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = event.clientX - rect.left;
      mouseY = event.clientY - rect.top;
    });
    const rect = canvas.getBoundingClientRect();

    intervalId = setInterval(() => {
      // Update mouseX and mouseY within the interval function


      let distance = Math.sqrt((mouseX - ball.x) ** 2 + (mouseY - ball.y) ** 2);

      if (distance <= ball.radius * 1.05 && !ball.isJumping) { // Increase the hitbox size to 105%
        ballHit();
        dy = -14; // Give the ball a positive y speed
        const audio = new Audio(`sounds/ping pong sounds 1-ping-pong-64516.mp3`);
        SCORE++;
        if (SCORE > 0) scoreElement.innerText = SCORE;
        /* audio.play(); */ // Need to be fixed
        randomNumber = Math.floor(Math.random() * 2) + 1;
        dx = -(mouseX - ball.x) * randomNumber / 10; // Set dx based on the distance of the mouse position relative to the ball (lower value = pushed more to the sides)

        ball.isJumping = true; // Set the jumping flag to true
        setTimeout(() => {
          ball.isJumping = false; // Reset the jumping flag after a delay
        }, 200); // Adjust the delay as needed
      }
    }, 1000 / 60);

  });

  document.addEventListener('mouseup', (event) => {
    clearInterval(intervalId);
  });
});

// Move the event listeners and updateAnimation call here
// Start the interval when the mouse is down
