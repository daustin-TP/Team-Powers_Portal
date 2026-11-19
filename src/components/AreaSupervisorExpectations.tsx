import { CalendarCheck2, Clock3, Goal, MessageSquareQuote, ShieldCheck, Store } from "lucide-react";

export default function AreaSupervisorExpectations() {
  return <div className="supervisor-expectations">
    <header className="expectations-hero"><div><p className="eyebrow">Team Powers leadership standard</p><h2>Weekly Area Supervisor Expectations</h2><p>Every visit and every shift should have a purpose. Leave able to identify what was recognized, who was developed, or what corrective action was set in motion.</p></div><ShieldCheck size={42}/></header>
    <div className="expectations-grid">
      <section><h3><Store/>At every store</h3><ul><li>One cut test</li><li>One Area Supervisor visit sheet</li><li>One Game Day visit completed by 4 PM</li><li>Review the prior week’s deposits</li><li>Review the store schedule</li></ul></section>
      <section><h3><CalendarCheck2/>Across the area each week</h3><ul><li>One opening visit</li><li>One closing visit</li><li>One closed-store visit</li><li>One rush observation</li><li>One quick recognition / feel-good visit</li></ul></section>
      <section><h3><Clock3/>Deadlines and time use</h3><ul><li>GM schedules due Wednesday by 8 PM</li><li>Schedules published by opening Friday</li><li>Tiger reports completed within 48 hours</li><li>Customer complaints resolved within 3 days</li></ul><div className="expectations-allocation"><span><b>35%</b> Store visits & operations</span><span><b>30%</b> GM coaching & talent</span><span><b>25%</b> Rush support</span><span><b>10%</b> Administration</span></div></section>
      <section><h3><Goal/>Weekly leadership work</h3><ul><li>Work one weeknight rush and one Friday or Saturday rush</li><li>Document one GM coaching conversation and its follow-up</li><li>Review staffing, hiring, training, and retention at every store</li><li>Identify emerging leaders, expert pizza makers, and trainers</li><li>Create an owner and follow-up for every missed target</li></ul></section>
    </div>
    <section className="expectations-rush"><div><p className="eyebrow">How to observe the rush</p><h3>Watch the manager before stepping in</h3></div><ol><li>Observe the GM or manager leading the shift.</li><li>Watch portioning, load times, bottlenecks, and team communication.</li><li>Debrief what worked, where the team became stuck, and what changes next rush.</li></ol></section>
    <section className="expectations-rules"><article><b>1</b><div><h3>Keep the GM in charge</h3><p>Recurring coverage means solving the staffing, scheduling, or leadership root cause—not replacing the GM.</p></div></article><article><b>2</b><div><h3>Give every visit a purpose</h3><p>Record the improvement, coaching conversation, and next step.</p></div></article><article><b>3</b><div><h3>Own the next step</h3><p>Bring a solution, name the owner, and follow through.</p></div></article></section>
    <section className="expectations-recap"><MessageSquareQuote/><div><h3>Weekly recap</h3><p>What improved? What needs work and action? Who developed—and how?</p><strong>The job is to coach General Managers to solve problems and hold them accountable.</strong></div></section>
  </div>;
}
