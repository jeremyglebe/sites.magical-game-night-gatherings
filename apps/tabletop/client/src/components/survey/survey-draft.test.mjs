import test from "node:test";
import assert from "node:assert/strict";
import {
  SURVEY_SCHEMA,
  normalizeResponse,
} from "../../../../shared/survey.mjs";
import {
  newSurveyDraft,
  savedSurveyDraft,
  surveyAnswers,
} from "./survey-draft.mjs";

test("questionnaire drafts preserve unanswered versus explicitly unknown ratings", () => {
  const draft = newSurveyDraft(SURVEY_SCHEMA);
  draft.ratings.deck_strength.score = null;
  draft.ratings.deck_strength.reason = "Not enough turns.";
  const restored = newSurveyDraft(
    SURVEY_SCHEMA,
    savedSurveyDraft(SURVEY_SCHEMA, draft),
  );
  assert.equal(restored.ratings.deck_strength.score, null);
  assert.equal(restored.ratings.fairness.score, "");
});

test("questionnaire serializes numeric ratings and only the reported incidents", () => {
  const draft = newSurveyDraft(SURVEY_SCHEMA);
  for (const answer of Object.values(draft.ratings)) {
    answer.score = "5";
    answer.reason = " Comparable. ";
  }
  draft.rules_observation = "none_observed";
  draft.confidence = "medium";
  draft.rules_incidents = [
    {
      description: "stale hidden draft",
      status: "uncertain",
      impact: "uncertain",
    },
  ];
  const answers = surveyAnswers(SURVEY_SCHEMA, draft);
  assert.deepEqual(answers.rules_incidents, []);
  assert.equal(answers.ratings.deck_strength.score, 5);
  assert.equal(answers.ratings.deck_strength.reason, "Comparable.");
  assert.doesNotThrow(() => normalizeResponse(answers, [{ id: "p1" }], 3));
  draft.rules_observation = "reported";
  draft.rules_incidents[0].revision = "2";
  assert.equal(
    surveyAnswers(SURVEY_SCHEMA, draft).rules_incidents[0].revision,
    2,
  );
});
