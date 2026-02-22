import pandas as pd
import json

# 1. Load FEMA raw data
print("Loading dataset...")
df = pd.read_csv('archive\DisasterDeclarationsSummaries_.csv')

# 2. Select core feature columns
# We track: state, incident type, Individual Assistance trigger (IA),
# and Public Assistance trigger (PA).
cols = ['state', 'incidentType', 'iaProgramDeclared', 'paProgramDeclared']
df_filtered = df[cols].copy()

# 3. Aggregate data and compute historical probabilities
print("Aggregating historical probabilities...")
# Group by state and incident type, then compute event counts and assistance triggers.
stats = df_filtered.groupby(['state', 'incidentType']).agg(
    total_incidents=('incidentType', 'count'),
    ia_approved=('iaProgramDeclared', 'sum'),
    pa_approved=('paProgramDeclared', 'sum')
).reset_index()

# Remove sparse categories (fewer than 6 events) to keep statistically meaningful profiles.
stats = stats[stats['total_incidents'] > 5]

# Convert rates to percentages.
stats['ia_prob'] = (stats['ia_approved'] / stats['total_incidents'] * 100).round(1)
stats['pa_prob'] = (stats['pa_approved'] / stats['total_incidents'] * 100).round(1)

# Terms commonly used by FEMA for weather-driven hazards.
WEATHER_INCIDENT_TERMS = (
    'storm', 'hurricane', 'typhoon', 'cyclone', 'tornado', 'flood',
    'snow', 'blizzard', 'freeze', 'freezing', 'ice', 'winter',
    'wind', 'rain', 'hail', 'coastal', 'wave', 'weather'
)


def is_weather_incident(incident_type: str) -> bool:
    incident = str(incident_type).strip().lower()
    return any(term in incident for term in WEATHER_INCIDENT_TERMS)


# 4. Transform to EventSim RAG JSON format
knowledge_base = []
for index, row in stats.iterrows():
    # Build search keywords for Fuse.js / keyword retrieval.
    keywords = [
        row['state'].lower(),
        row['incidentType'].lower(),
        "disaster"
    ]

    if is_weather_incident(row['incidentType']):
        keywords.extend(["storm", "weather"])

    # Map historical stats to Minimal/Moderate/Radical baseline prompts.
    event_entry = {
        "id": f"fema_{index}",
        "keywords": keywords,
        "historical_event": f"Historical {row['incidentType']}s in {row['state']} (Based on {row['total_incidents']} recorded incidents)",
        "statistical_insights": {
            "baseline_context": (
                f"Use this profile as a decision anchor for ambiguous user prompts. "
                f"For {row['incidentType']}s in {row['state']}, historical rates are "
                f"{row['ia_prob']}% for severe household impact (IA) and {row['pa_prob']}% "
                f"for public infrastructure strain (PA)."
            ),
            "minimal_impact": (
                f"Generate a conservative response strategy with minimal policy disruption. "
                f"Prioritize low-regret actions (targeted pricing updates, selective underwriting "
                f"tightening, focused preparedness messaging). Historically, {100 - row['ia_prob']}% "
                f"of these events avoid widespread IA-level household losses."
            ),
            "moderate_impact": (
                f"Generate a structural adjustment strategy. Include at least one material lever "
                f"(deductible redesign, coverage condition updates, portfolio rebalancing, or "
                f"capital allocation shifts). Ground severity on the {row['ia_prob']}% historical "
                f"likelihood of widespread IA-level household impact."
            ),
            "radical_impact": (
                f"Generate a survival-level strategy for tail-risk conditions. Include decisive "
                f"moves such as catastrophe financing, geographic exposure contraction, product "
                f"withdrawal, or rapid operating model change. Reflect the {row['pa_prob']}% "
                f"historical probability of PA-level infrastructure disruption."
            )
        }
    }
    knowledge_base.append(event_entry)

# 5. Export as backend-ready JSON
output_path = './backend/data/fema_historical_insights.json'
with open(output_path, 'w') as f:
    json.dump(knowledge_base, f, indent=4)

print(f"Successfully generated RAG knowledge base with {len(knowledge_base)} historical profiles saved to {output_path}!")
