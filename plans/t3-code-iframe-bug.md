Ich habe hier einen komischen Bug in meinem Projekt, über den ich schon lange nachdenke, woran das liegt, und ich habe keine wirkliche Lösung dafür, was der Grund ist oder woher dieses Problem kommt.

Ich erkläre jetzt ganz genau, was das Problem ist, und möchte immer analysieren, woran es liegt und wie wir es beheben können.

Es geht hier um die T3‑Code‑Nightly‑ und T3‑Code‑Stable‑Version. Also ist es letztendlich ein bisschen kompliziert und ein bisschen komisch zu beschreiben.

Ich habe hier in dem Projekt ja den iFrame mit T3‑Code, in dem rein theoretisch immer das angezeigt werden soll, was man in den Einstellungen des Projekts hier ausgewählt hat – also die Stable‑Version oder die Nightly‑Version. Das kann man ja auch umschalten.

Ich habe es im Moment auf Nightly gestellt, also explizit auf Nightly. Und ich habe hier diese Tailscaile‑Scale‑Adresse; wenn ich darauf gehe, sehe ich die T3‑Code‑Nightly‑Version.

https://tailnet-host.example.invalid/draft/demo-project-id

Allerdings habe ich hier in dem Projekt nur die T3‑Code‑Stable‑Version, also nicht die Nightly, sondern die Stable‑Version, die ich eigentlich in den Einstellungen nicht ausgewählt habe – das ist ein bisschen komisch.

Eigentlich sollte mir doch die T3‑Code‑Nightly‑Version hier angezeigt werden, obwohl sie mir nicht angezeigt wird.

Hier steht auch, dass es die Version 0.0.34 ist.

---

### Version`0.0.34`

Current version of the application.

---

Aber was mir auch auffällt: Hier habe ich in der T3‑Code‑Version im Projekt, das per iFrame eingebunden ist, nicht automatisch alle meine Threads, wie in der Tailscale‑Adresse, die ich habe. Stattdessen steht, wenn ich das zum ersten Mal öffne, **„Connect to an Environment to get started“**, und ich soll die Connections öffnen, also **„Open Connections“**. Hier ist der Text, der bei mir angezeigt wird.

---

Connect an environment to get started

Sign in to T3 Connect to connect a linked environment through its managed tunnel, or add a reachable backend manually.

Open Connections

---

Ich habe aber auch schon irgendwie einen Verdacht, in welche Richtung das geht.

Ich möchte nämlich eigentlich, dass ich das über dieses T3.codes, das bei mir dann gehostet ist, nutzen kann, damit ich mehrere Maschinen letztendlich verbinden und zwischen mehreren Servern wechseln kann. Ich möchte letztendlich diese mehrfache Steuerung haben, sodass ich sagen kann: Ich habe mehrere Maschinen, die in T3‑Code verbunden sind, und ich kann Arbeit auf ihnen verteilen.

Das soll über app.t3.codes lokal bei mir gehostet sein. Und ich weiß nicht, ob das über die Version, die ich auf tailscaile habe, auch so ist.

Ich habe das Gefühl, dass es ein mehrstufiges Problem ist, das sich auch auf einen allgemeinen Server bei mir bezieht. Vielleicht habe ich aus Versehen mehrere T3‑Code‑Instances am Laufen, die sich irgendwie überschneiden und kaputt gehen, und deswegen letztendlich.

Ich bin mir auch nicht sicher, ob die Nightly-Version, die ich habe, auf dem neuesten Stand ist, und einige Features, die auf Twitter oder X angekündigt wurden, funktionieren da drin gar nicht.

Ich habe nämlich auch einen Hermes‑Agent, der jeden Abend schauen soll, ob es Updates gibt, und die Updates installiert. Ich weiß nicht, ob es da vielleicht Probleme gibt. Da habe ich einen Skill in Hermes; kannst du vielleicht schon prüfen, ob es dort Probleme gibt?

Ich möchte vor allem, dass im T3‑Code, in dem iFrame hier im Projekt, die Version angezeigt wird, die man in den Einstellungen auswählt – also die Nightly‑ oder die Stable‑Version. Und das über dieses T3‑Codes irgendwie, sodass man mit mehreren Maschinen arbeiten kann.

Dabei soll letztendlich auch geprüft werden, ob mein Server hier so bereinigt ist, dass ich eine T3‑Code‑Instanz laufen habe, die über das Projekt hier läuft, die ich im Projekt öffnen und benutzen kann, und die ich letztlich auch per URL in einem externen Tab nutzen kann.

Ich habe schon einiges probiert und rumgestochert. Das ist ein tiefgehendes Problem, für das ich bis jetzt noch keine Lösung gefunden habe.

Deshalb möchte ich, dass du dir das Projekt hier ansiehst und gleichzeitig extern prüfst, ob es Probleme am Hosting‑Server gibt, ob andere Prozesse damit kollidieren oder ob im Hörmess‑Setup bei den regelmäßigen Updates etwas kaputt gegangen ist. Sorge bitte allgemein dafür, dass im Projekt, im iFrame, immer der korrekte T3‑Code angezeigt wird und dass sich das **Connect in Environment to Get Started** auf allen Geräten, auf denen es verwendet wird, synchronisiert.

Es sollte nicht sein, dass man sich auf jedem Gerät neu verbinden muss; wenn das nötig ist, soll es trotzdem ein lokales iFrame bleiben. Falls das nicht möglich ist und man sich pro Gerät einmal authentifizieren muss, ist das im T3‑Code zwar in Ordnung, solange die Daten zwischengespeichert werden und nicht die Instanz auf dem Server läuft und gestreamt wird – das ist zu langsam. Ein lokales iFrame ist performance‑technisch deutlich besser.

Es muss sichergestellt werden, dass der T3‑Code korrekt implementiert ist, dass der richtige T3‑Code angezeigt wird und dass nicht mehrere Instanzen gleichzeitig laufen, die sich gegenseitig beeinträchtigen.