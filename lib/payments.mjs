export const PLAN = {
  STANDARD: { uzs:129000, stars:850, revisions:1, label:'Standard' },
  PRO_AI: { uzs:349000, stars:2300, revisions:3, label:'PRO AI' },
  SIGNATURE: { uzs:899000, stars:5900, revisions:5, label:'Signature', activationUzs:99000, activationStars:650, finalUzs:800000, finalStars:5250 }
};

export function paymentRequirement(project, stage='activation') {
  const p = PLAN[project.plan];
  if (!p) throw new Error('Unknown plan');
  if (project.plan === 'SIGNATURE') {
    return stage === 'final'
      ? { stage:'final', uzs:p.finalUzs, stars:p.finalStars, title:'EMORA Signature Final' }
      : { stage:'activation', uzs:p.activationUzs, stars:p.activationStars, title:'EMORA Signature Activation' };
  }
  return { stage:'full', uzs:p.uzs, stars:p.stars, title:`EMORA ${p.label}` };
}

export function isPaid(project, stage) {
  return (project.payments||[]).some(p=>p.stage===stage && p.status==='PAID');
}

export function canBuild(project) {
  if (project.plan === 'SIGNATURE') return isPaid(project,'activation');
  return isPaid(project,'full');
}

export function canFinalize(project) {
  if (project.plan === 'SIGNATURE') return isPaid(project,'final');
  return isPaid(project,'full');
}
