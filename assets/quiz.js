/**
 * Reusable single-choice quiz widget.
 * Options should be equal length when possible to avoid format clues.
 */
function mountQuiz(containerId, question, options, correctIndex) {
  const root = document.getElementById(containerId)
  if (!root) return

  root.innerHTML = `
    <div class="quiz-question">${question}</div>
    <div class="quiz-options" role="group"></div>
    <div class="quiz-feedback" aria-live="polite"></div>
  `

  const optionsEl = root.querySelector('.quiz-options')
  const feedbackEl = root.querySelector('.quiz-feedback')

  options.forEach((label, index) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = label
    btn.addEventListener('click', () => {
      optionsEl.querySelectorAll('button').forEach(b => {
        b.disabled = true
      })
      if (index === correctIndex) {
        feedbackEl.textContent = '正确。可以进入下一节。'
        feedbackEl.className = 'quiz-feedback correct'
      } else {
        feedbackEl.textContent = '不对。先回忆上文架构图，再试一次（刷新页面可重做）。'
        feedbackEl.className = 'quiz-feedback wrong'
        setTimeout(() => {
          optionsEl.querySelectorAll('button').forEach(b => { b.disabled = false })
          feedbackEl.textContent = ''
          feedbackEl.className = 'quiz-feedback'
        }, 2200)
      }
    })
    optionsEl.appendChild(btn)
  })
}
