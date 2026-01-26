document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("mean3-reviews-container");
    if (!container) return;

    const productId = container.dataset.productId;
    const listContainer = document.getElementById("mean3-reviews-list");
    const form = document.getElementById("mean3-review-form");
    const messageContainer = document.getElementById("mean3-form-message");
    const summaryBar = document.getElementById("mean3-summary-bar");
    const lightbox = document.getElementById("mean3-lightbox");
    const lightboxImg = document.getElementById("mean3-lightbox-img");
    const lightboxClose = document.querySelector(".mean3-lightbox-close");

    // Store selected photos
    let selectedPhotos = [];

    // Pagination state
    let currentPage = 1;
    let totalPages = 1;

    // Rating labels
    const ratingLabels = {
        1: "Poor",
        2: "Fair", 
        3: "Good",
        4: "Very Good",
        5: "Excellent"
    };

    // ==================== STAR PICKER ====================
    const starPicker = document.getElementById("star-picker");
    const ratingInput = document.getElementById("rating-value");
    const ratingText = document.getElementById("rating-text");
    let currentRating = 5;

    if (starPicker) {
        const stars = starPicker.querySelectorAll(".star");
        
        const updateStars = (rating, isHover = false) => {
            stars.forEach((star, index) => {
                if (index < rating) {
                    star.classList.add("active");
                    if (isHover) star.classList.add("hover");
                } else {
                    star.classList.remove("active");
                    star.classList.remove("hover");
                }
            });
            if (ratingText) {
                ratingText.textContent = ratingLabels[rating] || "";
            }
        };

        // Initial state
        updateStars(currentRating);

        stars.forEach(star => {
            star.addEventListener("click", () => {
                currentRating = parseInt(star.dataset.rating);
                ratingInput.value = currentRating;
                updateStars(currentRating);
            });

            star.addEventListener("mouseenter", () => {
                updateStars(parseInt(star.dataset.rating), true);
            });

            star.addEventListener("mouseleave", () => {
                updateStars(currentRating);
            });
        });
    }

    // ==================== PHOTO UPLOAD ====================
    const photoBtn = document.getElementById("photo-btn");
    const photoInput = document.getElementById("photos");
    const photoPreview = document.getElementById("photo-preview");

    if (photoBtn && photoInput) {
        photoBtn.addEventListener("click", () => {
            photoInput.click();
        });

        photoInput.addEventListener("change", async (e) => {
            const files = Array.from(e.target.files);
            const maxFiles = 5;
            const maxSize = 2 * 1024 * 1024; // 2MB

            for (const file of files) {
                if (selectedPhotos.length >= maxFiles) {
                    alert("Maximum 5 photos allowed");
                    break;
                }
                if (file.size > maxSize) {
                    alert(`${file.name} is too large. Max 2MB per photo.`);
                    continue;
                }
                if (!file.type.startsWith("image/")) {
                    continue;
                }

                // Convert to base64
                const base64 = await fileToBase64(file);
                selectedPhotos.push(base64);
                addPhotoPreview(base64, selectedPhotos.length - 1);
            }
            // Clear input so same file can be selected again
            photoInput.value = "";
        });
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function addPhotoPreview(base64, index) {
        const wrapper = document.createElement("div");
        wrapper.className = "mean3-preview-item";
        wrapper.innerHTML = `
            <img src="${base64}" alt="Preview">
            <button type="button" class="mean3-remove-photo" data-index="${index}">&times;</button>
        `;
        photoPreview.appendChild(wrapper);

        wrapper.querySelector(".mean3-remove-photo").addEventListener("click", (e) => {
            const idx = parseInt(e.target.dataset.index);
            selectedPhotos.splice(idx, 1);
            rebuildPhotoPreview();
        });
    }

    function rebuildPhotoPreview() {
        photoPreview.innerHTML = "";
        selectedPhotos.forEach((photo, i) => addPhotoPreview(photo, i));
    }

    // ==================== LIGHTBOX ====================
    if (lightboxClose) {
        lightboxClose.addEventListener("click", () => {
            lightbox.style.display = "none";
        });
    }

    if (lightbox) {
        lightbox.addEventListener("click", (e) => {
            if (e.target === lightbox) {
                lightbox.style.display = "none";
            }
        });
    }

    function openLightbox(src) {
        lightboxImg.src = src;
        lightbox.style.display = "flex";
    }

    // ==================== RENDER SUMMARY BAR ====================
    function renderSummaryBar(stats) {
        if (!stats || stats.totalReviews === 0) {
            summaryBar.style.display = "none";
            return;
        }

        summaryBar.style.display = "flex";
        
        // Update rating display
        summaryBar.querySelector(".mean3-big-rating").textContent = stats.averageRating.toFixed(1);
        summaryBar.querySelector(".mean3-summary-count span").textContent = stats.totalReviews;
        
        // Update stars
        const starsContainer = summaryBar.querySelector(".mean3-summary-stars");
        const fullStars = Math.floor(stats.averageRating);
        const hasHalf = stats.averageRating % 1 >= 0.5;
        let starsHtml = "";
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) {
                starsHtml += '<span class="star filled">★</span>';
            } else if (i === fullStars + 1 && hasHalf) {
                starsHtml += '<span class="star half">★</span>';
            } else {
                starsHtml += '<span class="star empty">☆</span>';
            }
        }
        starsContainer.innerHTML = starsHtml;

        // Update distribution bars
        const distContainer = summaryBar.querySelector(".mean3-distribution");
        let distHtml = "";
        for (let i = 5; i >= 1; i--) {
            const count = stats.distribution[i] || 0;
            const percent = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
            distHtml += `
                <div class="mean3-dist-row">
                    <span class="mean3-dist-label">${i}★</span>
                    <div class="mean3-dist-bar">
                        <div class="mean3-dist-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="mean3-dist-count">${count}</span>
                </div>
            `;
        }
        distContainer.innerHTML = distHtml;
    }

    // ==================== RENDER REVIEWS ====================
    function renderReviews(reviews) {
        if (reviews && reviews.length > 0) {
            listContainer.innerHTML = reviews.map(review => {
                const reviewDate = new Date(review.createdAt).toLocaleDateString();
                const replyDate = review.replyAt ? new Date(review.replyAt).toLocaleDateString() : '';
                
                // Render photos if available
                let photosHtml = "";
                if (review.photos && review.photos.length > 0) {
                    photosHtml = `
                        <div class="mean3-review-photos">
                            ${review.photos.map(photo => `
                                <img src="${photo}" alt="Review photo" class="mean3-review-photo" onclick="window.mean3OpenLightbox('${photo}')">
                            `).join('')}
                        </div>
                    `;
                }

                return `
                    <div class="mean3-review-item">
                        <div class="mean3-review-header">
                            <strong>${review.customerName || 'Anonymous'}</strong>
                            <span class="mean3-star-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</span>
                            <span class="mean3-review-date">${reviewDate}</span>
                        </div>
                        <p class="mean3-review-comment">${review.comment}</p>
                        ${photosHtml}
                        ${review.reply ? `
                            <div class="mean3-review-reply">
                                <strong>Response from Store:</strong>
                                <p>${review.reply}</p>
                                ${replyDate ? `<span class="mean3-reply-date">Replied on: ${replyDate}</span>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } else {
            listContainer.innerHTML = "<p class='mean3-no-reviews'>No reviews yet. Be the first to write one!</p>";
        }
    }

    // ==================== RENDER PAGINATION ====================
    function renderPagination(pagination) {
        // Remove existing pagination if any
        const existingPagination = document.getElementById("mean3-pagination");
        if (existingPagination) {
            existingPagination.remove();
        }

        // Don't show pagination if only one page or no pages
        if (!pagination || pagination.totalPages <= 1) {
            return;
        }

        totalPages = pagination.totalPages;
        currentPage = pagination.currentPage;

        // Create pagination container
        const paginationContainer = document.createElement("div");
        paginationContainer.id = "mean3-pagination";
        paginationContainer.className = "mean3-pagination";

        // Build pagination HTML
        let paginationHtml = '';

        // Previous button
        paginationHtml += `
            <button class="mean3-page-btn mean3-prev-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">
                ← Previous
            </button>
        `;

        // Page numbers
        paginationHtml += '<div class="mean3-page-numbers">';
        for (let i = 1; i <= totalPages; i++) {
            // Show first page, last page, current page, and pages around current
            if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                paginationHtml += `
                    <button class="mean3-page-btn mean3-page-num ${i === currentPage ? 'active' : ''}" data-page="${i}">
                        ${i}
                    </button>
                `;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                paginationHtml += '<span class="mean3-page-ellipsis">...</span>';
            }
        }
        paginationHtml += '</div>';

        // Next button
        paginationHtml += `
            <button class="mean3-page-btn mean3-next-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">
                Next →
            </button>
        `;

        // Page info
        paginationHtml += `
            <div class="mean3-page-info">
                Page ${currentPage} of ${totalPages} (${pagination.totalReviews} reviews)
            </div>
        `;

        paginationContainer.innerHTML = paginationHtml;

        // Insert pagination after reviews list
        listContainer.insertAdjacentElement('afterend', paginationContainer);

        // Add click handlers
        paginationContainer.querySelectorAll('.mean3-page-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = parseInt(e.target.dataset.page);
                if (page && page !== currentPage) {
                    fetchReviews(page);
                }
            });
        });
    }

    // Expose lightbox function globally for inline onclick
    window.mean3OpenLightbox = openLightbox;

    // ==================== FETCH REVIEWS ====================
    function fetchReviews(page = 1) {
        listContainer.innerHTML = "<p>Loading reviews...</p>";
        
        fetch(`/apps/reviews?productId=${productId}&page=${page}&limit=3`)
            .then(res => res.json())
            .then(data => {
                renderReviews(data.reviews);
                renderSummaryBar(data.stats);
                renderPagination(data.pagination);
                
                // Scroll to reviews section on page change (not on initial load)
                if (page > 1 || currentPage !== 1) {
                    listContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            })
            .catch(err => {
                console.error(err);
                listContainer.innerHTML = "<p>Failed to load reviews.</p>";
            });
    }

    // Initial fetch
    fetchReviews(1);

    // ==================== HANDLE SUBMIT ====================
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const payload = {
            productId: formData.get("productId"),
            rating: formData.get("rating") || currentRating,
            comment: formData.get("comment"),
            customerName: formData.get("customerName"),
            email: formData.get("email"),
            photos: selectedPhotos
        };

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
                messageContainer.className = "mean3-message success";
                form.reset();
                selectedPhotos = [];
                photoPreview.innerHTML = "";
                currentRating = 5;
                if (starPicker) {
                    const stars = starPicker.querySelectorAll(".star");
                    stars.forEach((star, index) => {
                        star.classList.toggle("active", index < 5);
                    });
                }
                if (ratingText) ratingText.textContent = "Excellent";
            } else {
                messageContainer.textContent = result.error || "Failed to submit review.";
                messageContainer.style.color = "red";
                messageContainer.className = "mean3-message error";
            }
        } catch (err) {
            console.error(err);
            messageContainer.textContent = "An error occurred.";
            messageContainer.style.color = "red";
            messageContainer.className = "mean3-message error";
        }
    });
});
