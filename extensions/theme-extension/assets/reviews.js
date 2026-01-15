document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("mean3-reviews-container");
    if (!container) return;

    const productId = container.dataset.productId;
    const listContainer = document.getElementById("mean3-reviews-list");
    const form = document.getElementById("mean3-review-form");
    const messageContainer = document.getElementById("mean3-form-message");

    // Fetch Reviews
    fetch(`/apps/reviews?productId=${productId}`)
        .then(res => res.json())
        .then(data => {
            if (data.reviews && data.reviews.length > 0) {
                listContainer.innerHTML = data.reviews.map(review => {
        const reviewDate = new Date(review.createdAt).toLocaleDateString();
        const replyDate = review.replyAt ? new Date(review.replyAt).toLocaleDateString() : '';
        
        return `
        <div class="mean3-review-item">
          <div class="mean3-review-header">
            <strong>${review.customerName || 'Anonymous'}</strong>
            <span class="mean3-review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</span>
            <span class="mean3-review-date" style="font-size: 0.8em; color: #666; margin-left: 10px;">${reviewDate}</span>
          </div>
          <p class="mean3-review-comment">${review.comment}</p>
          ${review.reply ? `
            <div class="mean3-review-reply" style="background: #f9f9f9; padding: 10px; margin-top: 10px; border-left: 3px solid #ccc;">
              <strong>Response from Store:</strong>
              <p>${review.reply}</p>
              ${replyDate ? `<p style="font-size: 0.8em; color: #666; margin-top: 5px;">Replied on: ${replyDate}</p>` : ''}
            </div>
          ` : ''}
        </div>
      `;
      }).join('');
            } else {
                listContainer.innerHTML = "<p>No reviews yet. Be the first to write one!</p>";
            }
        })
        .catch(err => {
            console.error(err);
            listContainer.innerHTML = "<p>Failed to load reviews.</p>";
        });

    // Handle Submit
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData);

        try {
            const res = await fetch("/apps/reviews", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (result.success) {
                messageContainer.textContent = "Review submitted successfully! Pending approval.";
                messageContainer.style.color = "green";
                form.reset();
            } else {
                messageContainer.textContent = result.error || "Failed to submit review.";
                messageContainer.style.color = "red";
            }
        } catch (err) {
            console.error(err);
            messageContainer.textContent = "An error occurred.";
            messageContainer.style.color = "red";
        }
    });
});
