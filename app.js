const storageKey = "fake-news-review-v1";

const reasonKeys = [
  "fabrication",
  "distortion",
  "false_attribution",
  "sensationalism",
  "data_manipulation",
  "visual_discrepancy",
];

const state = {
  dataset: window.FAKE_NEWS_REVIEW_DATA || { entries: [] },
  currentIndex: 0,
  reviews: loadReviews(),
  saveTimer: null,
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
  textTypeChip: document.getElementById("textTypeChip"),
  caseId: document.getElementById("caseId"),
  headlineText: document.getElementById("headlineText"),
  bodyText: document.getElementById("bodyText"),
  verdictState: document.getElementById("verdictState"),
  verdictButtons: Array.from(document.querySelectorAll("#verdictButtons .verdict-btn")),
  reasonState: document.getElementById("reasonState"),
  reasonHint: document.getElementById("reasonHint"),
  reasonCards: Array.from(document.querySelectorAll(".reason-card")),
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

const reasonElements = reasonKeys.reduce((accumulator, key) => {
  accumulator[key] = {
    checkbox: document.getElementById(`reason-${key}`),
    note: document.getElementById(`note-${key}`),
    card: document.querySelector(`.reason-card[data-reason="${key}"]`),
  };
  return accumulator;
}, {});

function emptyReasonState() {
  return reasonKeys.reduce((accumulator, key) => {
    accumulator[key] = { selected: false, note: "" };
    return accumulator;
  }, {});
}

function emptyReview() {
  return {
    verdict: "",
    reasons: emptyReasonState(),
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

function normalizeReview(review) {
  const normalized = emptyReview();
  if (!review || typeof review !== "object") {
    return normalized;
  }

  normalized.verdict = review.verdict || "";
  normalized.other_evidence = review.other_evidence || "";
  normalized.updated_at = review.updated_at || "";

  reasonKeys.forEach((key) => {
    const source = review.reasons && review.reasons[key] ? review.reasons[key] : {};
    normalized.reasons[key] = {
      selected: Boolean(source.selected),
      note: source.note || "",
    };
  });

  return normalized;
}

function entryReview(entry) {
  return normalizeReview(state.reviews[getCaseId(entry)]);
}

function isCaseCompleted(entry) {
  return Boolean(entryReview(entry).verdict);
}

function hasReasonDetails(entry) {
  const review = entryReview(entry);
  if (review.other_evidence.trim()) {
    return true;
  }
  return reasonKeys.some((key) => review.reasons[key].selected || review.reasons[key].note.trim());
}

function updateCounts() {
  const total = state.dataset.entries.length;
  const completed = state.dataset.entries.filter((entry) => isCaseCompleted(entry)).length;

  elements.totalCount.textContent = total;
  elements.completedTotal.textContent = total;
  elements.completedCount.textContent = completed;
  elements.progressFill.style.width = total ? `${(completed / total) * 100}%` : "0%";
}

function updateNavigator() {
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
  if (activeItem) {
    window.setTimeout(() => {
      activeItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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

  elements.currentIndex.textContent = entry.sample_index;
  elements.caseImage.src = entry.image;
  elements.caseImage.alt = `Sample ${entry.sample_index}`;
  elements.sourceChip.textContent = `Source ${entry.source}`;
  elements.textTypeChip.textContent = entry.text_type_label;
  elements.caseId.textContent = entry.article_id;
  elements.headlineText.textContent = entry.headline;
  elements.bodyText.textContent = entry.text;
  elements.otherEvidence.value = review.other_evidence;
  elements.charCount.textContent = `${review.other_evidence.length} characters`;
  elements.verdictState.textContent = verdictLabel(review.verdict);
  elements.reasonState.textContent = review.updated_at ? `Saved ${new Date(review.updated_at).toLocaleString()}` : "Optional";
  elements.saveState.textContent = review.updated_at && review.other_evidence.trim()
    ? `Saved ${new Date(review.updated_at).toLocaleString()}`
    : "Optional";

  reasonKeys.forEach((key) => {
    reasonElements[key].checkbox.checked = review.reasons[key].selected;
    reasonElements[key].note.value = review.reasons[key].note;
  });

  updateVerdictButtons(review.verdict);
  updateReasonAvailability(review.verdict === "fake");

  elements.prevBtn.disabled = state.currentIndex === 0;
  elements.nextBtn.disabled = state.currentIndex === state.dataset.entries.length - 1;

  updateCounts();
  updateNavigator();
}

function updateVerdictButtons(selectedVerdict) {
  elements.verdictButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.verdict === selectedVerdict);
  });
}

function updateReasonAvailability(enabled) {
  elements.reasonHint.textContent = enabled
    ? "Optional: choose any evidence types that helped you decide this sample is fake."
    : "Select \"Fake News\" above to enable these fields.";

  reasonKeys.forEach((key) => {
    reasonElements[key].checkbox.disabled = !enabled;
    reasonElements[key].note.disabled = !enabled;
    reasonElements[key].card.classList.toggle("disabled", !enabled);
  });
}

function collectCurrentReview() {
  const entry = currentEntry();
  const existing = entry ? entryReview(entry) : emptyReview();

  const reasons = emptyReasonState();
  reasonKeys.forEach((key) => {
    reasons[key] = {
      selected: reasonElements[key].checkbox.checked,
      note: reasonElements[key].note.value,
    };
  });

  return {
    verdict: existing.verdict,
    reasons,
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
  elements.reasonState.textContent = `Saved ${new Date(review.updated_at).toLocaleString()}`;
  elements.saveState.textContent = review.other_evidence.trim()
    ? `Saved ${new Date(review.updated_at).toLocaleString()}`
    : "Optional";
  updateCounts();
  updateNavigator();
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
  elements.reasonState.textContent = `Saved ${new Date(review.updated_at).toLocaleString()}`;
  updateVerdictButtons(verdict);
  updateReasonAvailability(verdict === "fake");
  updateCounts();
  updateNavigator();
}

function clearCurrentExtras() {
  reasonKeys.forEach((key) => {
    reasonElements[key].checkbox.checked = false;
    reasonElements[key].note.value = "";
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
    "fabrication_selected",
    "fabrication_note",
    "distortion_selected",
    "distortion_note",
    "false_attribution_selected",
    "false_attribution_note",
    "sensationalism_selected",
    "sensationalism_note",
    "data_manipulation_selected",
    "data_manipulation_note",
    "visual_discrepancy_selected",
    "visual_discrepancy_note",
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
      review.reasons.fabrication.selected ? "yes" : "no",
      review.reasons.fabrication.note,
      review.reasons.distortion.selected ? "yes" : "no",
      review.reasons.distortion.note,
      review.reasons.false_attribution.selected ? "yes" : "no",
      review.reasons.false_attribution.note,
      review.reasons.sensationalism.selected ? "yes" : "no",
      review.reasons.sensationalism.note,
      review.reasons.data_manipulation.selected ? "yes" : "no",
      review.reasons.data_manipulation.note,
      review.reasons.visual_discrepancy.selected ? "yes" : "no",
      review.reasons.visual_discrepancy.note,
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

  reasonKeys.forEach((key) => {
    reasonElements[key].checkbox.addEventListener("change", () => {
      elements.reasonState.textContent = "Saving...";
      scheduleSave();
    });
    reasonElements[key].note.addEventListener("input", () => {
      elements.reasonState.textContent = "Saving...";
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
  render();
}

init();
