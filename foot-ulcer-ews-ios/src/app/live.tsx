import { useQuery } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import { LiveChart } from "@/components/Charts";
import { FootMap } from "@/components/FootMap";
import { StatusBadge, StatusIcon } from "@/components/StatusIcon";
import { LiveTable } from "@/components/Tables";
import { Callout, Card, Code, Empty, Muted, Screen, Tile, Tiles } from "@/components/ui";
import { api } from "@/lib/api";
import { CLINICAL, LIVE_DEMO, SITE_LABELS, TIER_LABEL, TIER_RANK, warmerFoot, worstTier } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";

/** Demo mode: a reading every second, compared immediately - the resting rule is switched off. */
export default function LiveScreen() {
  const t = useTheme();
  const samples = useQuery(api.live, { seconds: LIVE_DEMO.history_s });
  const now = useNow(1000);

  const banner = (
    <Callout tier="demo">
      <Text style={{ color: t.textPrimary, lineHeight: 20 }}>
        <Text style={{ fontWeight: "700" }}>Demo mode · resting rule off. </Text>
        Temperature is taken every {LIVE_DEMO.interval_s} s and compared left vs right straight away. Normally only
        calm overnight readings are compared. Alert after {LIVE_DEMO.alert_consecutive_samples} readings in a row at
        ≥ {CLINICAL.alert_c} °C (instead of {CLINICAL.alert_consecutive_days} nights).
      </Text>
    </Callout>
  );

  if (samples === undefined) return <Screen><Empty title="Connecting…" /></Screen>;
  if (!samples.length) {
    return (
      <Screen>
        {banner}
        <Empty title="No live readings yet">
          <Muted>Start the live stream from the foot-ulcer-ews folder on the Mac:</Muted>
          <Code>{".venv/bin/python -m pipeline.live"}</Code>
        </Empty>
      </Screen>
    );
  }

  const cur = samples[samples.length - 1];
  const streaming = now - cur.t < 3000;
  const worst = worstTier(cur.sites);
  const top = cur.sites.filter((r) => r.deltaC !== null).sort((a, b) => Math.abs(b.deltaC!) - Math.abs(a.deltaC!))[0];
  const flagged = cur.sites.filter((r) => r.tier === "alert" || r.tier === "warning")
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const lastMin = samples.filter((s) => s.t > cur.t - 60000).length;

  return (
    <Screen>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: streaming ? t.good : t.textMuted }]} />
        <Muted>
          {streaming ? "Streaming" : "Paused"} · last reading {new Date(cur.t).toLocaleTimeString()}
        </Muted>
      </View>

      {banner}

      <Tiles>
        <Tile label="Right now" value={<StatusBadge kind={worst} large />}
          sub={flagged.length ? `${flagged.length} spot${flagged.length > 1 ? "s" : ""} flagged` : "left and right feet match"} />
        <Tile label="Biggest difference" value={top ? `${Math.abs(top.deltaC!).toFixed(1)} °C` : "—"}
          sub={top ? `${SITE_LABELS[top.site]} · ${warmerFoot(top.deltaC) ?? "neither"} foot warmer` : "no valid readings"} />
        <Tile label="Readings last minute" value={lastMin} sub={`one every ${LIVE_DEMO.interval_s} s · 10 sensors`} />
        <Tile label="Stream" value={streaming ? "Live" : "Paused"}
          sub={streaming ? "updates every second" : "start python -m pipeline.live"} />
      </Tiles>

      {flagged.length > 0 && (
        <Callout tier={flagged[0].tier}>
          {flagged.map((r) => (
            <View key={r.site} style={styles.calloutRow}>
              <StatusIcon kind={r.tier} size={16} />
              <Text style={{ color: t.textPrimary, flex: 1, lineHeight: 20 }}>
                <Text style={{ fontWeight: "700" }}>{TIER_LABEL[r.tier]}</Text> · {SITE_LABELS[r.site]}:{" "}
                {warmerFoot(r.deltaC)} foot {Math.abs(r.deltaC!).toFixed(1)} °C warmer
              </Text>
            </View>
          ))}
        </Callout>
      )}

      <Card title="Your soles · live">
        <FootMap rows={cur.sites} live />
      </Card>

      <Card title="Left − right difference, second by second"
        subtitle={`Last ${LIVE_DEMO.history_s} s. Drag across the chart to look back.`}>
        <LiveChart samples={samples} windowS={LIVE_DEMO.history_s} />
      </Card>

      <Card title="Current readings">
        <LiveTable sites={cur.sites} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  calloutRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});
