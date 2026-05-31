import { useState, useRef, useCallback } from "react";

function MeterBar({ label, value, color, bg, delay = 0 }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
        <span>{label}</span>
        <span style={{ color, fontWeight: "700" }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "99px", overflow: "hidden", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.07)" }}>
        <div style={{
          height: "100%", width: `${value * 100}%`,
          background: `linear-gradient(90deg, ${bg}, ${color})`,
          borderRadius: "99px",
          transition: "width 1.3s cubic-bezier(0.23,1,0.32,1)",
          transitionDelay: `${delay}ms`,
          boxShadow: `0 1px 6px ${color}55`
        }} />
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: "9px", color: "#94a3b8", letterSpacing: "0.12em", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "12px", color: "#334155", fontWeight: "600" }}>{value}</div>
    </div>
  );
}

const SCAN_STEPS = [
  "Decoding image…",
  "Sending to model…",
  "Extracting features…",
  "Running TTA inference…",
  "Computing probabilities…",
];

export default function App() {
  const [dragging,  setDragging]  = useState(false);
  const [imgSrc,    setImgSrc]    = useState(null);
  const [step,      setStep]      = useState("idle");
  const [progress,  setProgress]  = useState(0);
  const [result,    setResult]    = useState(null);
  const [errMsg,    setErrMsg]    = useState("");
  const [logItems,  setLogItems]  = useState([]);
  const [apiUrl,    setApiUrl]    = useState("");
  const [urlSaved,  setUrlSaved]  = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const fileRef = useRef();

  // ── Core predict function ─────────────────────────────────────────────────
  const predict = useCallback(async (base64Data) => {
    const savedUrl = localStorage && false; // no localStorage in artifacts
    const url = apiUrl.trim();

    if (!url) {
      setStep("error");
      setErrMsg("API URL not provided! plz setup the connection to your Colab model first.");
      return;
    }

    setStep("scanning");
    setProgress(0);
    setLogItems([]);
    setResult(null);
    setErrMsg("");

    // Progress animation
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 7 + 3;
      if (p >= 88) { clearInterval(iv); p = 88; }
      setProgress(Math.round(p));
    }, 140);

    // Log steps animation
    SCAN_STEPS.forEach((msg, i) =>
      setTimeout(() => setLogItems(prev => [...prev, msg]), i * 520)
    );

    try {
      // Clean URL
      const endpoint = url.replace(/\/$/, "") + "/predict";

      const response = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          image: base64Data,   // full base64 with prefix — server strips it
          tta:   true
        }),
      });

      clearInterval(iv);

      if (!response.ok) {
        const txt = await response.text();
        throw new Error(`Server error ${response.status}: ${txt.slice(0, 200)}`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Normalise fields
      const r = {
        is_fake    : Boolean(data.is_fake),
        verdict    : data.is_fake ? "AI-GENERATED" : "REAL",
        fake_prob  : Math.max(0, Math.min(1, Number(data.fake_prob) || 0)),
        real_prob  : Math.max(0, Math.min(1, Number(data.real_prob) || 0)),
        confidence : Math.max(0, Math.min(100, Number(data.confidence) || 0)),
        risk       : data.risk || (data.fake_prob > 0.85 ? "HIGH" : data.fake_prob > 0.6 ? "MEDIUM" : "LOW"),
        signals    : Array.isArray(data.signals) ? data.signals : [],
        summary    : data.summary || "",
      };

      setProgress(100);
      setTimeout(() => { setResult(r); setStep("done"); }, 350);

    } catch (err) {
      clearInterval(iv);
      setProgress(0);
      setStep("error");
      let msg = err.message;
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        msg = "not connected to server.\n\n"
            + "Check :\n"
            + "• is colab connected?\n"
            + "• is ngrok tunnel active?\n"
            + "• is url correct? (https://penalize-animate-mustard.ngrok-free.dev)\n"
            ;
      }
      setErrMsg(msg);
    }
  }, [apiUrl]);

  // ── File loader ───────────────────────────────────────────────────────────
  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setImgSrc(e.target.result);
      setResult(null); setStep("idle");
      setProgress(0); setLogItems([]); setErrMsg("");
      setTimeout(() => predict(e.target.result), 200);
    };
    reader.readAsDataURL(file);
  }, [predict]);

  const reset = () => {
    setImgSrc(null); setResult(null);
    setStep("idle"); setProgress(0);
    setLogItems([]); setErrMsg("");
  };

  const verdictColor  = result ? (result.is_fake ? "#dc2626" : "#16a34a") : "#6366f1";
  const verdictLight  = result ? (result.is_fake ? "#fef2f2" : "#f0fdf4") : "#eff6ff";
  const verdictBorder = result ? (result.is_fake ? "#fca5a5" : "#86efac") : "#bfdbfe";

  const isConfigured = apiUrl.trim().startsWith("http");

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(150deg,#f8fafc 0%,#eef2ff 55%,#faf5ff 100%)",
      fontFamily: "'Segoe UI',system-ui,sans-serif",
      paddingBottom: "60px"
    }}>
      <style>{`
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes beam   { 0%{top:-4px} 100%{top:calc(100%+4px)} }
        @keyframes pop    { 0%{transform:scale(0.9);opacity:0} 60%{transform:scale(1.03)} 100%{transform:scale(1);opacity:1} }
        @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0.4)} 50%{box-shadow:0 0 0 8px rgba(34,197,94,0)} }
        @keyframes shake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        .drop-zone:hover  { border-color:#6366f1!important; background:#eef2ff!important; }
        .mini-btn:hover   { background:#f1f5f9!important; }
        .result-card      { animation:pop 0.4s cubic-bezier(.23,1,.32,1) both }
        .log-item         { animation:fadeUp 0.3s ease both }
        .setup-panel      { animation:fadeUp 0.25s ease both }
        .shake            { animation:shake 0.35s ease }
        input[type=text]:focus { outline:none; border-color:#6366f1!important; box-shadow:0 0 0 3px #6366f122; }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background:"#fff", borderBottom:"1px solid #e2e8f0",
        padding:"14px 28px", display:"flex",
        alignItems:"center", justifyContent:"space-between",
        boxShadow:"0 1px 8px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{
            width:"36px", height:"36px", borderRadius:"10px",
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"18px", boxShadow:"0 2px 10px #6366f144"
          }}>🔍</div>
          <div>
            <div style={{ fontSize:"15px", fontWeight:"700", color:"#1e293b", letterSpacing:"-0.02em" }}>
              CIFake Detector
            </div>
            <div style={{ fontSize:"10px", color:"#94a3b8" }}>
              MobileNetV2 · CIFake Dataset · Real-time inference
            </div>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          {/* Status dot */}
          <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
            <div style={{
              width:"8px", height:"8px", borderRadius:"50%",
              background: isConfigured ? "#22c55e" : "#f59e0b",
              animation: isConfigured ? "pulse 2s infinite" : "none",
              boxShadow: isConfigured ? "none" : "0 0 0 0 transparent"
            }}/>
            <span style={{ fontSize:"11px", color: isConfigured ? "#16a34a" : "#d97706", fontWeight:"500" }}>
              {isConfigured ? "Connected" : "Not configured"}
            </span>
          </div>

          {/* Setup button */}
          <button
            onClick={() => setShowSetup(s => !s)}
            style={{
              padding:"7px 14px", borderRadius:"8px", border:"1px solid #e2e8f0",
              background: showSetup ? "#ede9fe" : "#fff",
              color: showSetup ? "#6366f1" : "#64748b",
              fontSize:"12px", fontWeight:"600", cursor:"pointer"
            }}>
            ⚙ Setup
          </button>
        </div>
      </div>

      {/* ── Setup Panel ────────────────────────────────────────────────────── */}
      {showSetup && (
        <div className="setup-panel" style={{
          background:"#fff", borderBottom:"2px solid #e2e8f0",
          padding:"20px 28px", boxShadow:"0 4px 20px rgba(0,0,0,0.06)"
        }}>
          <div style={{ maxWidth:"860px", marginInline:"auto" }}>
            <div style={{ fontSize:"13px", fontWeight:"700", color:"#1e293b", marginBottom:"14px" }}>
              🔗 Connect to Colab Model
            </div>

            {/* Steps */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px", marginBottom:"18px" }}>
              {[
                { n:"1", title:"Run Colab Notebook", desc:"CIFake_API_Server.ipynb connect and load" },
                { n:"2", title:"Get ngrok URL",      desc:"url will print after step 7: https://penalize-animate-mustard.ngrok-free.dev" },
                { n:"3", title:"Paste URL Below",    desc:"paste url!" },
              ].map(({ n, title, desc }) => (
                <div key={n} style={{
                  padding:"12px 14px", borderRadius:"10px",
                  background:"#f8fafc", border:"1px solid #e2e8f0"
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"5px" }}>
                    <div style={{
                      width:"20px", height:"20px", borderRadius:"50%",
                      background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"11px", color:"#fff", fontWeight:"700", flexShrink:0
                    }}>{n}</div>
                    <span style={{ fontSize:"12px", fontWeight:"600", color:"#334155" }}>{title}</span>
                  </div>
                  <div style={{ fontSize:"11px", color:"#64748b", lineHeight:1.5, paddingLeft:"28px" }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* URL input */}
            <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
              <div style={{ flex:1, position:"relative" }}>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={e => { setApiUrl(e.target.value); setUrlSaved(false); }}
                  placeholder="https://penalize-animate-mustard.ngrok-free.dev"
                  style={{
                    width:"100%", padding:"10px 14px",
                    borderRadius:"10px", border:"1.5px solid #e2e8f0",
                    fontSize:"13px", color:"#334155",
                    background:"#fff", boxSizing:"border-box",
                    fontFamily:"'Courier New',monospace"
                  }}
                />
              </div>
              <button
                onClick={async () => {
                  const u = apiUrl.trim().replace(/\/$/, "");
                  if (!u) return;
                  try {
                    const r = await fetch(u + "/health");
                    const d = await r.json();
                    if (d.status === "online") {
                      setUrlSaved(true);
                      setShowSetup(false);
                      alert(`Connected!\nModel: ${d.model}\nDevice: ${d.device}`);
                    } else throw new Error("Bad response");
                  } catch (e) {
                    alert("Connection failed!\n\nCheck:\n• is colab connected?\n• is ngrok tunnel active?\n• is URL correct?");
                  }
                }}
                style={{
                  padding:"10px 20px", borderRadius:"10px", border:"none",
                  background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color:"#fff", fontSize:"12px", fontWeight:"600",
                  cursor:"pointer", whiteSpace:"nowrap",
                  boxShadow:"0 2px 10px #6366f144"
                }}>
                Test & Save
              </button>
            </div>

            {urlSaved && (
              <div style={{
                marginTop:"10px", padding:"8px 14px", borderRadius:"8px",
                background:"#f0fdf4", border:"1px solid #86efac",
                fontSize:"12px", color:"#16a34a", fontWeight:"600"
              }}>
                ✓ Connected! Now upload images.
              </div>
            )}

            {/* Help link */}
            <div style={{
              marginTop:"12px", padding:"10px 14px", borderRadius:"8px",
              background:"#fffbeb", border:"1px solid #fde68a",
              fontSize:"11px", color:"#92400e"
            }}>
              <strong>:</strong> 
            </div>
          </div>
        </div>
      )}

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div style={{ textAlign:"center", padding:"36px 20px 24px" }}>
        <div style={{
          display:"inline-block", padding:"4px 14px", borderRadius:"99px",
          background:"#ede9fe", color:"#7c3aed", fontSize:"11px",
          fontWeight:"600", letterSpacing:"0.08em", marginBottom:"12px"
        }}>
          MOBILENETV2 · CIFAKE DATASET · TTA × 3
        </div>
        <h1 style={{
          fontSize:"clamp(24px,4vw,40px)", fontWeight:"800", color:"#0f172a",
          margin:"0 0 10px", letterSpacing:"-0.03em", lineHeight:1.15
        }}>
          Real photo or{" "}
          <span style={{ background:"linear-gradient(90deg,#6366f1,#a855f7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            AI-generated?
          </span>
        </h1>
        <p style={{ color:"#64748b", fontSize:"14px", margin:0, maxWidth:"420px", marginInline:"auto" }}>
          Upload any image — your trained CIFake model analyses it instantly.
        </p>

        {/* Not configured warning */}
        {!isConfigured && (
          <div style={{
            display:"inline-flex", alignItems:"center", gap:"8px",
            marginTop:"14px", padding:"8px 18px", borderRadius:"99px",
            background:"#fffbeb", border:"1px solid #fde68a",
            fontSize:"12px", color:"#92400e"
          }}>
            ⚠ First <button onClick={() => setShowSetup(true)}
              style={{ background:"none", border:"none", color:"#d97706", fontWeight:"700", cursor:"pointer", padding:"0 2px", fontSize:"12px" }}>
              Setup ⚙
            </button> karo — ngrok URL enter karo
          </div>
        )}
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div style={{
        maxWidth:"860px", marginInline:"auto", padding:"0 20px",
        display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px", alignItems:"start"
      }}>

        {/* LEFT — Drop zone */}
        <div>
          <div
            className="drop-zone"
            onClick={() => { if (!imgSrc || step !== "scanning") fileRef.current.click(); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); loadFile(e.dataTransfer.files[0]); }}
            style={{
              aspectRatio:"1/1", borderRadius:"20px",
              border:`2px dashed ${dragging ? "#6366f1" : "#cbd5e1"}`,
              background: dragging ? "#eef2ff" : "#fff",
              display:"flex", flexDirection:"column",
              alignItems:"center", justifyContent:"center",
              cursor: step === "scanning" ? "default" : "pointer",
              position:"relative", overflow:"hidden",
              transition:"all 0.25s",
              boxShadow:"0 4px 24px rgba(0,0,0,0.06)"
            }}>
            <input ref={fileRef} type="file" accept="image/*"
              style={{ display:"none" }}
              onChange={e => { if(e.target.files[0]) loadFile(e.target.files[0]); e.target.value=""; }} />

            {imgSrc && (
              <img src={imgSrc} alt="uploaded" style={{
                position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover"
              }}/>
            )}

            {/* Scan beam */}
            {step === "scanning" && (
              <div style={{ position:"absolute", inset:0, zIndex:3, background:"rgba(255,255,255,0.18)", backdropFilter:"blur(0.5px)" }}>
                <div style={{
                  position:"absolute", left:0, right:0, height:"3px",
                  background:"linear-gradient(90deg,transparent,#6366f1 40%,#a855f7 60%,transparent)",
                  boxShadow:"0 0 18px #6366f1aa",
                  animation:"beam 1.1s ease-in-out infinite", zIndex:4
                }}/>
              </div>
            )}

            {/* Verdict badge */}
            {result && step === "done" && (
              <>
                <div style={{
                  position:"absolute", top:"12px", left:"12px", zIndex:5,
                  padding:"5px 14px", borderRadius:"99px",
                  background: result.is_fake ? "#dc2626" : "#16a34a",
                  color:"#fff", fontSize:"12px", fontWeight:"700",
                  boxShadow:"0 2px 12px rgba(0,0,0,0.25)",
                  animation:"fadeUp 0.4s ease"
                }}>
                  {result.is_fake ? "⚠ AI-GENERATED" : "✓ REAL"}
                </div>
                <div style={{
                  position:"absolute", bottom:"12px", right:"12px", zIndex:5,
                  padding:"4px 10px", borderRadius:"99px",
                  background:"rgba(0,0,0,0.55)", backdropFilter:"blur(4px)",
                  color:"#fff", fontSize:"11px", fontWeight:"600"
                }}>
                  {result.confidence.toFixed(1)}% confident
                </div>
              </>
            )}

            {/* Empty state */}
            {!imgSrc && (
              <>
                <div style={{
                  width:"54px", height:"54px", borderRadius:"16px",
                  background:"linear-gradient(135deg,#ede9fe,#ddd6fe)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:"24px", marginBottom:"12px"
                }}>🖼️</div>
                <div style={{ fontWeight:"600", color:"#334155", fontSize:"14px", marginBottom:"5px" }}>
                  Drop your image here
                </div>
                <div style={{ fontSize:"12px", color:"#94a3b8", marginBottom:"16px" }}>or click to browse</div>
                <div style={{
                  padding:"8px 22px", borderRadius:"8px",
                  background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                  color:"#fff", fontSize:"12px", fontWeight:"600",
                  boxShadow:"0 2px 10px #6366f155"
                }}>Choose File</div>
                <div style={{ fontSize:"10px", color:"#cbd5e1", marginTop:"12px" }}>JPG · PNG · WEBP · GIF</div>
              </>
            )}
          </div>

          {imgSrc && step !== "scanning" && (
            <div style={{ display:"flex", gap:"8px", marginTop:"10px" }}>
              <button className="mini-btn" onClick={reset} style={{
                flex:1, padding:"9px", borderRadius:"10px",
                border:"1px solid #e2e8f0", background:"#fff",
                color:"#64748b", fontSize:"12px", fontWeight:"500",
                cursor:"pointer", transition:"background 0.2s"
              }}>✕ Clear</button>
              <button className="mini-btn" onClick={() => fileRef.current.click()} style={{
                flex:1, padding:"9px", borderRadius:"10px",
                border:"1px solid #e2e8f0", background:"#fff",
                color:"#6366f1", fontSize:"12px", fontWeight:"600",
                cursor:"pointer", transition:"background 0.2s"
              }}>↩ Change</button>
            </div>
          )}
        </div>

        {/* RIGHT — Result panel */}
        <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>

          {/* Idle */}
          {step === "idle" && (
            <div style={{
              padding:"48px 24px", borderRadius:"20px",
              background:"#fff", border:"1px solid #e2e8f0",
              textAlign:"center", boxShadow:"0 4px 20px rgba(0,0,0,0.04)"
            }}>
              <div style={{ fontSize:"40px", opacity:0.35, marginBottom:"12px" }}>🔎</div>
              <div style={{ fontWeight:"600", color:"#94a3b8", fontSize:"14px" }}>Awaiting image</div>
              <div style={{ color:"#cbd5e1", fontSize:"12px", marginTop:"5px" }}>
                {isConfigured ? "Upload a photo to begin analysis" : "Setup karo pehle ↗"}
              </div>
            </div>
          )}

          {/* Scanning */}
          {step === "scanning" && (
            <div style={{
              padding:"24px", borderRadius:"20px",
              background:"#fff", border:"1px solid #e2e8f0",
              boxShadow:"0 4px 20px rgba(0,0,0,0.04)"
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"16px" }}>
                <div style={{
                  width:"32px", height:"32px", borderRadius:"50%", flexShrink:0,
                  border:"3px solid #e2e8f0",
                  borderTopColor:"#6366f1", borderRightColor:"#a855f7",
                  animation:"spin 0.75s linear infinite"
                }}/>
                <div>
                  <div style={{ fontWeight:"700", color:"#1e293b", fontSize:"14px" }}>Model analysing…</div>
                  <div style={{ fontSize:"11px", color:"#94a3b8" }}>CIFake MobileNetV2 · TTA × 3</div>
                </div>
              </div>
              <div style={{ height:"6px", background:"#f1f5f9", borderRadius:"99px", overflow:"hidden", marginBottom:"16px" }}>
                <div style={{
                  height:"100%", width:`${progress}%`,
                  background:"linear-gradient(90deg,#6366f1,#a855f7)",
                  borderRadius:"99px", transition:"width 0.2s ease",
                  boxShadow:"0 0 10px #6366f166"
                }}/>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                {logItems.map((msg, i) => (
                  <div key={i} className="log-item" style={{ display:"flex", alignItems:"center", gap:"8px", animationDelay:`${i*50}ms` }}>
                    <div style={{
                      width:"17px", height:"17px", borderRadius:"50%", flexShrink:0,
                      background:"linear-gradient(135deg,#6366f1,#a855f7)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"9px", color:"#fff"
                    }}>✓</div>
                    <span style={{ fontSize:"12px", color:"#475569" }}>{msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div style={{
              padding:"22px", borderRadius:"20px",
              background:"#fef2f2", border:"1px solid #fca5a5",
              boxShadow:"0 4px 20px rgba(220,38,38,0.07)"
            }}>
              <div style={{ fontWeight:"700", color:"#dc2626", fontSize:"14px", marginBottom:"10px" }}>
                ⚠ Error
              </div>
              <pre style={{
                fontSize:"11px", color:"#7f1d1d", lineHeight:1.7,
                whiteSpace:"pre-wrap", wordBreak:"break-word",
                background:"#fee2e2", padding:"10px 12px", borderRadius:"8px",
                margin:"0 0 14px", fontFamily:"'Courier New',monospace"
              }}>{errMsg}</pre>
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={() => { setShowSetup(true); setStep("idle"); }} style={{
                  padding:"8px 16px", borderRadius:"8px",
                  border:"1px solid #fca5a5", background:"#fff",
                  color:"#dc2626", fontSize:"12px", fontWeight:"600", cursor:"pointer"
                }}>⚙ Fix Setup</button>
                <button onClick={() => { if (imgSrc) predict(imgSrc); }} style={{
                  padding:"8px 16px", borderRadius:"8px", border:"none",
                  background:"#dc2626", color:"#fff",
                  fontSize:"12px", fontWeight:"600", cursor:"pointer"
                }}>↩ Retry</button>
              </div>
            </div>
          )}

          {/* Result */}
          {step === "done" && result && (
            <>
              <div className="result-card" style={{
                padding:"20px", borderRadius:"20px",
                background:verdictLight, border:`1.5px solid ${verdictBorder}`,
                boxShadow:`0 4px 24px ${verdictColor}18`
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
                  <span style={{ fontSize:"10px", color:"#94a3b8", fontWeight:"600", letterSpacing:"0.1em" }}>VERDICT</span>
                  <span style={{
                    padding:"3px 10px", borderRadius:"99px", fontSize:"10px", fontWeight:"700",
                    background: result.risk==="HIGH" ? "#fee2e2" : result.risk==="MEDIUM" ? "#fef9c3" : "#dcfce7",
                    color: result.risk==="HIGH" ? "#b91c1c" : result.risk==="MEDIUM" ? "#a16207" : "#15803d"
                  }}>{result.risk} RISK</span>
                </div>
                <div style={{ fontSize:"24px", fontWeight:"800", color:verdictColor, marginBottom:"5px", letterSpacing:"-0.02em" }}>
                  {result.is_fake ? "⚠ AI-Generated" : "✓ Real Image"}
                </div>
                <div style={{ fontSize:"13px", color:"#64748b" }}>
                  <strong style={{ color:verdictColor }}>{result.confidence.toFixed(1)}%</strong> confident
                </div>
                {result.summary && (
                  <div style={{
                    marginTop:"10px", fontSize:"12px", color:"#475569",
                    padding:"9px 12px", borderRadius:"8px",
                    background:"rgba(255,255,255,0.65)", lineHeight:1.6, fontStyle:"italic"
                  }}>"{result.summary}"</div>
                )}
              </div>

              <div style={{ padding:"16px 18px", borderRadius:"16px", background:"#fff", border:"1px solid #e2e8f0", boxShadow:"0 2px 10px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize:"10px", color:"#94a3b8", fontWeight:"600", letterSpacing:"0.1em", marginBottom:"12px" }}>PROBABILITY SCORES</div>
                <MeterBar label="Real Image"   value={result.real_prob} color="#16a34a" bg="#86efac" delay={0}   />
                <MeterBar label="AI-Generated" value={result.fake_prob} color="#dc2626" bg="#fca5a5" delay={160} />
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px" }}>
                <StatChip label="MODEL"    value="MobileNetV2" />
                <StatChip label="METHOD"   value="TTA × 3 views" />
                <StatChip label="DATASET"  value="CIFake (60k)" />
                <StatChip label="BACKEND"  value={apiUrl.replace("https://","").slice(0,22)+"…"} />
              </div>

              <button onClick={() => { reset(); setTimeout(() => fileRef.current.click(), 100); }} style={{
                width:"100%", padding:"12px", borderRadius:"12px", border:"none",
                background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
                color:"#fff", fontSize:"13px", fontWeight:"600",
                cursor:"pointer", boxShadow:"0 4px 14px #6366f144"
              }}>Analyse Another Image →</button>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ maxWidth:"860px", marginInline:"auto", padding:"40px 20px 0", textAlign:"center" }}>
        <div style={{ fontSize:"11px", color:"#cbd5e1" }}>
          Built by Zafarullah · Emerson University Multan · AI Dept
        </div>
      </div>
    </div>
  );
}