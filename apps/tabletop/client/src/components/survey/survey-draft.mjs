export function newSurveyDraft(schema, saved = {}) {
  return {
    ratings: Object.fromEntries(
      (schema.ratings || []).map((question) => {
        const old = saved.ratings?.[question.id];
        return [
          question.id,
          {
            score:
              old && !saved._unansweredRatings?.includes(question.id)
                ? old.score
                : "",
            reason: old?.reason || "",
          },
        ];
      }),
    ),
    ...Object.fromEntries(
      (schema.textQuestions || []).map((question) => [
        question.id,
        saved[question.id] || "",
      ]),
    ),
    rules_observation: saved.rules_observation || "",
    rules_incidents: (saved.rules_incidents || []).map((incident) => ({
      ...incident,
    })),
    confidence: saved.confidence || "",
  };
}

export function surveyAnswers(schema, draft) {
  return {
    ratings: Object.fromEntries(
      (schema.ratings || []).map((question) => {
        const answer = draft.ratings[question.id];
        return [
          question.id,
          {
            score:
              answer.score === null || answer.score === ""
                ? null
                : Number(answer.score),
            reason: answer.reason.trim(),
          },
        ];
      }),
    ),
    ...Object.fromEntries(
      (schema.textQuestions || []).map((question) => [
        question.id,
        draft[question.id].trim(),
      ]),
    ),
    rules_observation: draft.rules_observation,
    rules_incidents:
      draft.rules_observation === "reported"
        ? draft.rules_incidents.map((incident) => ({
            description: incident.description.trim(),
            status: incident.status,
            impact: incident.impact,
            revision:
              incident.revision === "" ||
              incident.revision === null ||
              incident.revision === undefined
                ? null
                : Number(incident.revision),
          }))
        : [],
    confidence: draft.confidence,
  };
}

export function savedSurveyDraft(schema, draft) {
  return {
    ...surveyAnswers(schema, draft),
    _unansweredRatings: (schema.ratings || [])
      .filter((question) => draft.ratings[question.id].score === "")
      .map((question) => question.id),
  };
}
