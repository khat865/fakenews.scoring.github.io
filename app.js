const storageKey = "fake-news-review-v2";

const aspectKeys = [
  "factual_error",
  "language_issue",
  "image_relevance",
  "image_authenticity",
];

const state = {
  dataset: window.FAKE_NEWS_REVIEW_DATA || { entries: [] },
  currentIndex: 0,
  reviews: loadReviews(),
  saveTimer: null,
  renderToken: 0,
  imageCache: new Map(),
};

const elements = {
  currentIndex: document.getElementById("currentIndex"),
  totalCount: document.getElementById("totalCount"),
  completedCount: document.getElementById("completedCount"),
  completedTotal: document.getElementById("completedTotal"),
  progressFill: document.getElementById("progressFill"),
  navigatorSlider: document.getElementById("navigatorSlider"),
  caseImage: document.getElementById("caseImage"),
  sourceChip: document.getElementById("sourceChip"),
  caseId: document.getElementById("caseId"),
  headlineText: document.getElementById("headlineText"),
  bodyText: document.getElementById("bodyText"),
  verdictState: document.getElementById("verdictState"),
  verdictButtons: Array.from(document.querySelectorAll("#verdictButtons .verdict-btn")),
  aspectState: document.getElementById("aspectState"),
  aspectButtons: Array.from(document.querySelectorAll("#aspectGrid .aspect-btn")),
  saveState: document.getElementById("saveState"),
  otherEvidence: document.getElementById("otherEvidence"),
  charCount: document.getElementById("charCount"),
  caseProgressContainer: document.getElementById("caseProgressContainer"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  downloadCsvBtn: document.getElementById("downloadCsvBtn"),
  clearCurrentBtn: document.getElementById("clearCurrentBtn"),
  openImageBtn: document.getElementById("openImageBtn"),
};

const aspectElements = aspectKeys.reduce((accumulator, key) => {
  accumulator[key] = {
    buttons: Array.from(document.querySelectorAll(`.aspect-btn[data-aspect="${key}"]`)),
    card: document.querySelector(`.aspect-card[data-aspect="${key}"]`),
  };
  return accumulator;
}, {});

function emptyAspectState() {
  return aspectKeys.reduce((accumulator, key) => {
    accumulator[key] = "";
    return accumulator;
  }, {});
}

function emptyReview() {
  return {
    verdict: "",
    aspects: emptyAspectState(),
    other_evidence: "",
    updated_at: "",
  };
}

function loadReviews() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch (error) {
    console.warn("Failed to load saved reviews:", error);
    return {};
  }
}

function persistReviews() {
  localStorage.setItem(storageKey, JSON.stringify(state.reviews));
}

function getCaseId(entry) {
  return entry.id;
}

function currentEntry() {
  return state.dataset.entries[state.currentIndex];
}

function preloadImage(src) {
  if (!src) {
    return Promise.resolve();
  }
  if (state.imageCache.has(src)) {
    return state.imageCache.get(src);
  }

  const promise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(src);
    image.onerror = () => resolve(src);
    image.src = src;
    if (image.decode) {
      image.decode().then(() => resolve(src)).catch(() => {});
    }
  });

  state.imageCache.set(src, promise);
  return promise;
}

function preloadAround(index) {
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  offsets.forEach((offset) => {
    const entry = state.dataset.entries[index + offset];
    if (entry) {
      preloadImage(entry.image);
    }
  });
}

function warmRemainingImages(startIndex) {
  const entries = state.dataset.entries;
  let pointer = 0;

  function step() {
    let loaded = 0;
    while (pointer < entries.length && loaded < 6) {
      const index = (startIndex + pointer) % entries.length;
      preloadImage(entries[index].image);
      pointer += 1;
      loaded += 1;
    }
    if (pointer < entries.length) {
      window.setTimeout(step, 80);
    }
  }

  window.setTimeout(step, 120);
}

function normalizeReview(review) {
  const normalized = emptyReview();
  if (!review || typeof review !== "object") {
    return normalized;
  }

  normalized.verdict = review.verdict || "";
  normalized.other_evidence = review.other_evidence || "";
  normalized.updated_at = review.updated_at || "";

  aspectKeys.forEach((key) => {
    normalized.aspects[key] = review.aspects && review.aspects[key]
      ? review.aspects[key]
      : "";
  });

  return normalized;
}

function entryReview(entry) {
  return normalizeReview(state.reviews[getCaseId(entry)]);
}

function isCaseCompleted(entry) {
  const review = entryReview(entry);
  return Boolean(review.verdict) && aspectKeys.every((key) => Boolean(review.aspects[key]));
}

function hasReasonDetails(entry) {
  const review = entryReview(entry);
  return Boolean(review.other_evidence.trim());
}

function updateCounts() {
  const total = state.dataset.entries.length;
  const completed = state.dataset.entries.filter((entry) => isCaseCompleted(entry)).length;

  elements.totalCount.textContent = total;
  elements.completedTotal.textContent = total;
  elements.completedCount.textContent = completed;
  elements.progressFill.style.width = total ? `${(completed / total) * 100}%` : "0%";
}

function updateNavigator(scrollActive = true) {
  elements.caseProgressContainer.innerHTML = "";
  state.dataset.entries.forEach((entry, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "case-progress-item";
    button.textContent = entry.sample_index;
    button.title = `Sample ${entry.sample_index}`;

    if (index === state.currentIndex) {
      button.classList.add("active");
    }
    if (isCaseCompleted(entry)) {
      button.classList.add("reviewed");
    }
    if (hasReasonDetails(entry)) {
      button.classList.add("annotated");
    }

    button.addEventListener("click", () => {
      saveCurrentDraft();
      state.currentIndex = index;
      render();
    });
    elements.caseProgressContainer.appendChild(button);
  });

  const activeItem = elements.caseProgressContainer.querySelector(".case-progress-item.active");
  if (scrollActive && activeItem) {
    window.setTimeout(() => {
      const container = elements.caseProgressContainer;
      const targetLeft = activeItem.offsetLeft - (container.clientWidth - activeItem.clientWidth) / 2;
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      container.scrollTo({
        left: Math.max(0, Math.min(targetLeft, maxScroll)),
        behavior: "smooth",
      });
      syncNavigatorSlider();
    }, 50);
  }
}

function verdictLabel(verdict) {
  if (verdict === "fake") {
    return "Marked Fake News";
  }
  if (verdict === "true") {
    return "Marked True News";
  }
  return "Not judged yet";
}

function render() {
  const entry = currentEntry();
  if (!entry) {
    return;
  }

  const review = entryReview(entry);
  const renderToken = ++state.renderToken;

  elements.currentIndex.textContent = entry.sample_index;
  elements.caseImage.alt = `Sample ${entry.sample_index}`;
  elements.sourceChip.textContent = `Source ${entry.source}`;
  elements.caseId.textContent = entry.article_id;
  elements.headlineText.textContent = entry.headline;
  elements.bodyText.textContent = entry.text;
  elements.otherEvidence.value = review.other_evidence;
  elements.charCount.textContent = `${review.other_evidence.length} characters`;
  elements.verdictState.textContent = verdictLabel(review.verdict);
  elements.aspectState.textContent = review.updated_at ? `Saved ${new Date(review.updated_at).toLocaleString()}` : "Required";
  elements.saveState.textContent = review.updated_at && review.other_evidence.trim()
    ? `Saved ${new Date(review.updated_at).toLocaleString()}`
    : "Optional";

  aspectKeys.forEach((key) => {
    updateAspectButtons(key, review.aspects[key]);
  });

  updateVerdictButtons(review.verdict);

  elements.prevBtn.disabled = state.currentIndex === 0;
  elements.nextBtn.disabled = state.currentIndex === state.dataset.entries.length - 1;

  updateCounts();
  updateNavigator();
  preloadAround(state.currentIndex);
  preloadImage(entry.image).then(() => {
    if (renderToken !== state.renderToken) {
      return;
    }
    elements.caseImage.src = entry.image;
  });
}

function updateVerdictButtons(selectedVerdict) {
  elements.verdictButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.verdict === selectedVerdict);
  });
}

function updateAspectButtons(aspectKey, selectedValue) {
  aspectElements[aspectKey].buttons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.value === selectedValue);
  });
}

function collectCurrentReview() {
  const entry = currentEntry();
  const existing = entry ? entryReview(entry) : emptyReview();

  const aspects = emptyAspectState();
  aspectKeys.forEach((key) => {
    const selectedButton = aspectElements[key].buttons.find((button) => button.classList.contains("selected"));
    aspects[key] = selectedButton ? selectedButton.dataset.value : "";
  });

  return {
    verdict: existing.verdict,
    aspects,
    other_evidence: elements.otherEvidence.value,
    updated_at: new Date().toISOString(),
  };
}

function saveCurrentDraft() {
  const entry = currentEntry();
  if (!entry) {
    return;
  }

  const existing = entryReview(entry);
  const review = collectCurrentReview();
  review.verdict = existing.verdict;

  state.reviews[getCaseId(entry)] = review;
  persistReviews();

  elements.charCount.textContent = `${review.other_evidence.length} characters`;
  elements.aspectState.textContent = `Saved ${new Date(review.updated_at).toLocaleString()}`;
  elements.saveState.textContent = review.other_evidence.trim()
    ? `Saved ${new Date(review.updated_at).toLocaleString()}`
    : "Optional";
  updateCounts();
  updateNavigator(false);
}

function scheduleSave() {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(saveCurrentDraft, 250);
}

function setVerdict(verdict) {
  const entry = currentEntry();
  if (!entry) {
    return;
  }

  const review = collectCurrentReview();
  review.verdict = verdict;
  review.updated_at = new Date().toISOString();

  state.reviews[getCaseId(entry)] = review;
  persistReviews();

  elements.verdictState.textContent = verdictLabel(verdict);
  elements.aspectState.textContent = `Saved ${new Date(review.updated_at).toLocaleString()}`;
  updateVerdictButtons(verdict);
  updateCounts();
  updateNavigator(false);
}

function clearCurrentExtras() {
  aspectKeys.forEach((key) => {
    updateAspectButtons(key, "");
  });
  elements.otherEvidence.value = "";
  saveCurrentDraft();
}

function navigate(direction) {
  const target = state.currentIndex + direction;
  if (target < 0 || target >= state.dataset.entries.length) {
    return;
  }
  saveCurrentDraft();
  state.currentIndex = target;
  render();
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function downloadCsv() {
  saveCurrentDraft();
  const headers = [
    "sample_index",
    "id",
    "article_id",
    "source",
    "variant",
    "ground_truth_is_fake",
    "headline",
    "image",
    "text_type",
    "text",
    "review_verdict",
    "review_updated_at",
    "factual_error",
    "language_issue",
    "image_relevance",
    "image_authenticity",
    "other_evidence",
  ];

  const lines = [headers.join(",")];
  state.dataset.entries.forEach((entry) => {
    const review = entryReview(entry);
    const row = [
      entry.sample_index,
      entry.id,
      entry.article_id,
      entry.source,
      entry.variant,
      entry.ground_truth_is_fake ? "yes" : "no",
      entry.headline,
      entry.image,
      entry.text_type,
      entry.text,
      review.verdict,
      review.updated_at,
      review.aspects.factual_error,
      review.aspects.language_issue,
      review.aspects.image_relevance,
      review.aspects.image_authenticity,
      review.other_evidence,
    ].map(escapeCsv);

    lines.push(row.join(","));
  });

  const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fake_news_review_results.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openImageInNewTab() {
  const entry = currentEntry();
  if (!entry) {
    return;
  }
  window.open(entry.image, "_blank", "noopener,noreferrer");
}

function syncNavigatorSlider() {
  const container = elements.caseProgressContainer;
  const slider = elements.navigatorSlider;
  if (!container || !slider) {
    return;
  }
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  if (maxScroll === 0) {
    slider.value = "0";
    slider.disabled = true;
    return;
  }
  slider.disabled = false;
  const ratio = container.scrollLeft / maxScroll;
  slider.value = String(Math.round(ratio * 1000));
}

function scrollNavigatorBySlider() {
  const container = elements.caseProgressContainer;
  const slider = elements.navigatorSlider;
  if (!container || !slider) {
    return;
  }
  const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
  const ratio = Number(slider.value) / 1000;
  container.scrollLeft = maxScroll * ratio;
}

function setupEvents() {
  elements.verdictButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setVerdict(button.dataset.verdict);
    });
  });

  elements.aspectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      updateAspectButtons(button.dataset.aspect, button.dataset.value);
      elements.aspectState.textContent = "Saving...";
      scheduleSave();
    });
  });

  elements.otherEvidence.addEventListener("input", () => {
    elements.charCount.textContent = `${elements.otherEvidence.value.length} characters`;
    elements.saveState.textContent = "Saving...";
    scheduleSave();
  });

  elements.navigatorSlider.addEventListener("input", scrollNavigatorBySlider);
  elements.caseProgressContainer.addEventListener("scroll", syncNavigatorSlider);

  elements.prevBtn.addEventListener("click", () => navigate(-1));
  elements.nextBtn.addEventListener("click", () => navigate(1));
  elements.downloadCsvBtn.addEventListener("click", downloadCsv);
  elements.clearCurrentBtn.addEventListener("click", clearCurrentExtras);
  elements.openImageBtn.addEventListener("click", openImageInNewTab);

  window.addEventListener("beforeunload", saveCurrentDraft);
  window.addEventListener("resize", syncNavigatorSlider);
  window.addEventListener("keydown", (event) => {
    if (event.target.tagName === "TEXTAREA") {
      return;
    }
    if (event.key === "ArrowLeft") {
      navigate(-1);
    }
    if (event.key === "ArrowRight") {
      navigate(1);
    }
  });
}

function init() {
  if (!state.dataset.entries.length) {
    elements.bodyText.textContent = "No review samples were loaded.";
    return;
  }
  setupEvents();
  preloadAround(0);
  warmRemainingImages(0);
  render();
}

init();
