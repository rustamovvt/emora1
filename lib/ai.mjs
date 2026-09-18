const OPENAI_URL = 'https://api.openai.com/v1/responses';

function extractText(json) {
  if (typeof json.output_text === 'string') return json.output_text;
  const parts = [];
  for (const item of json.output || []) {
    for (const c of item.content || []) if (typeof c.text === 'string') parts.push(c.text);
  }
  return parts.join('\n');
}

async function askJSON(instructions, input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
  const r = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${key}`, 'content-type':'application/json' },
    body: JSON.stringify({
      model,
      store: false,
      instructions: `${instructions}\nReturn ONLY valid JSON. No markdown fences.`,
      input: JSON.stringify(input)
    })
  });
  if (!r.ok) throw new Error(`OpenAI error ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const text = extractText(data).trim();
  return JSON.parse(text);
}

const palettes = {
  'soft-romantic': { bg:'#fff8fb', ink:'#18294a', accent:'#ff9fbd', secondary:'#dceeff' },
  'cinematic-dream': { bg:'#f6f4ff', ink:'#18294a', accent:'#9baaf8', secondary:'#ffd5e2' },
  'elegant-signature': { bg:'#fffaf5', ink:'#172746', accent:'#e6b4c7', secondary:'#d9e9ff' }
};

export async function generateConcepts(project) {
  const ai = await askJSON(
    'You are EMORA creative director. Create exactly 3 differentiated premium digital-gift concepts. JSON shape: {"concepts":[{"id":"soft-romantic","name":"...","summary":"...","mood":"...","palette":{"bg":"#...","ink":"#...","accent":"#...","secondary":"#..."}}]}. Keep ids: soft-romantic, cinematic-dream, elegant-signature.',
    { plan:project.plan, recipient:project.recipientName, brief:project.brief }
  ).catch(()=>null);
  if (ai?.concepts?.length === 3) return ai.concepts;
  return [
    {id:'soft-romantic', name:'Soft Romantic', summary:'Mayin, samimiy va qalbga yaqin.', mood:'soft · intimate · warm', palette:palettes['soft-romantic']},
    {id:'cinematic-dream', name:'Cinematic Dream', summary:'Kinematik o‘tishlar va xotiralarga boy hikoya.', mood:'cinematic · emotional · dreamy', palette:palettes['cinematic-dream']},
    {id:'elegant-signature', name:'Elegant Signature', summary:'Zarif editorial estetika va premium ritm.', mood:'editorial · refined · timeless', palette:palettes['elegant-signature']}
  ];
}

function baseScenes(project, concept) {
  const n = project.recipientName || 'Siz';
  const userMessage = project.brief?.message || `${n}, bu kichik sovg‘a siz uchun.`;
  const photoMedia = (project.media || []).filter(m => m.kind === 'image');
  const voiceMedia = (project.media || []).filter(m => m.kind === 'audio' && m.role !== 'music');
  const musicMedia = (project.media || []).filter(m => m.kind === 'audio' && m.role === 'music');
  const videoMedia = (project.media || []).filter(m => m.kind === 'video');
  const scenes = [
    {type:'intro', kicker:'EMORA', title:`${n}, bu sen uchun.`, body:'Bir necha daqiqaga hammasini chetga qo‘y.', interaction:'tap'},
    {type:'nameReveal', kicker:'01', title:n, body:'Ba’zi insonlar oddiy kunlarni ham ma’noli qiladi.'}
  ];
  if (photoMedia.length) scenes.push({type:'gallery', kicker:'XOTIRALAR', title:'Bizning chiroyli lahzalarimiz', body:'Har bir surat — alohida hikoya.', media:photoMedia.slice(0, project.plan==='STANDARD'?5:15).map(m=>m.url)});
  else scenes.push({type:'gallery', kicker:'XOTIRALAR', title:'Esda qoladigan lahzalar', body:'Bu yerga sizning suratlaringiz joylashadi.', media:[]});
  scenes.push({type:'letter', kicker:'MAKTUB', title:'Aytilmay qolgan so‘zlar', body:userMessage});

  if (project.plan === 'STANDARD') {
    scenes.push({type:'final', kicker:'YAKUN', title:`${n}, sen qadrlisan.`, body:'Bu kichik sovg‘a faqat sen uchun.'});
    return scenes;
  }

  scenes.push({type:'nameReveal', kicker:'BIR XOTIRA', title:'Ba’zi lahzalar qayta-qayta eslanadi', body:'Chunki ular ichida biz uchun muhim odamlar bor.'});
  if (voiceMedia[0]) scenes.push({type:'audio', kicker:'OVOZ', title:'Bu safar ovozim bilan', body:'Ba’zi hislar so‘zlardan ham chuqurroq.', media:[voiceMedia[0].url]});
  else scenes.push({type:'audio', kicker:'OVOZ', title:'Ovozli xabar uchun joy', body:'PRO va Signature’da bu sahnaga sizning ovozingiz qo‘shiladi.', media:[]});
  scenes.push({type:'secret', kicker:'MAXFIY SAHNA', title:'Bosib ushlab tur', body:'Kutilmagan kichik syurpriz.', interaction:'hold'});
  scenes.push({type:'letter', kicker:'SEN HAQINGDA', title:'Nima uchun aynan sen?', body:`Chunki ${n} — bu hikoyaning eng muhim qismi.`});

  if (project.plan === 'PRO_AI') {
    scenes.push({type:'final', kicker:'YAKUN', title:`${n}, sen qadrlisan.`, body:'Bu faqat sovg‘a emas. Bu sening hikoyang.'});
    return scenes;
  }

  if (videoMedia[0]) scenes.push({type:'video', kicker:'VIDEO', title:'Bu xotirani yana bir bor', body:'Faqat sen uchun.', media:[videoMedia[0].url]});
  else scenes.push({type:'video', kicker:'VIDEO', title:'Bir lahza — harakatda', body:'Signature’da video xotira shu yerda jonlanadi.', media:[]});
  scenes.push({type:'nameReveal', kicker:'TIMELINE', title:'Bizni shu kungacha olib kelgan yo‘l', body:'Kichik lahzalar birlashib katta hikoya bo‘ladi.'});
  scenes.push({type:'gallery', kicker:'MEMORY WALL', title:'Yana bir nechta xotira', body:'Eng qimmatli suratlar uchun alohida sahna.', media:photoMedia.slice(4,12).map(m=>m.url)});
  scenes.push({type:'secret', kicker:'SIGNATURE MOMENT', title:'Faqat sen biladigan detal', body:'Bu sahna faqat shu insonga mos yaratiladi.', interaction:'hold'});
  scenes.push({type:'letter', kicker:'SO‘NGGI SO‘ZLAR', title:'Yakunlashdan oldin', body:'Ba’zi odamlar hayotga shunchaki kirib kelmaydi — ular uni chiroyliroq qiladi.'});
  scenes.push({type:'final', kicker:'YAKUN', title:`${n}, sen doim maxsussan.`, body:'Bu faqat sovg‘a emas. Bu sening hikoyang.'});
  return scenes;
}

export async function buildStory(project, concept) {
  const ai = await askJSON(
    'Create a premium mobile-first emotional digital gift story. JSON shape: {"theme":{"bg":"#...","ink":"#...","accent":"#...","secondary":"#..."},"scenes":[{"type":"intro|nameReveal|gallery|letter|audio|video|secret|final","kicker":"...","title":"...","body":"...","interaction":"tap|hold|swipe|none"}]}. 5-7 scenes STANDARD, 8-12 PRO_AI, 12-18 SIGNATURE. Keep copy tasteful, natural Uzbek, not cringe.',
    { recipient:project.recipientName, plan:project.plan, brief:project.brief, concept, media:(project.media||[]).map(m=>({kind:m.kind,role:m.role,url:m.url})) }
  ).catch(()=>null);
  const musicMedia = (project.media || []).find(m => m.kind === 'audio' && m.role === 'music');
  const music = musicMedia ? {url:musicMedia.url,name:musicMedia.name,volume:0.35,loop:true} : null;
  if (ai?.scenes?.length) {
    return { theme: ai.theme || concept.palette, scenes: ai.scenes, music };
  }
  return { theme: concept.palette, scenes: baseScenes(project, concept), music };
}

export async function reviseStory(project, instruction) {
  const ai = await askJSON(
    'Edit the provided story according to the customer instruction while preserving valid JSON shape {theme,scenes}. Do not add unsupported scene types. Keep all copy concise and premium.',
    { instruction, story:project.story, recipient:project.recipientName, brief:project.brief }
  ).catch(()=>null);
  if (ai?.scenes) return ai;
  const story = structuredClone(project.story);
  const q = instruction.toLowerCase();
  if (q.includes('ko‘k') || q.includes("ko'k") || q.includes('blue')) { story.theme.accent='#90b9ed'; story.theme.secondary='#e8f4ff'; }
  if (q.includes('pushti') || q.includes('pink')) story.theme.accent='#f6a7c0';
  if (q.includes('qisqa')) story.scenes = story.scenes.map(s=>({...s,body:(s.body||'').split(/(?<=[.!?])\s+/)[0]||s.body}));
  if (q.includes('final')) {
    const f = story.scenes.find(s=>s.type==='final'); if (f) f.body = 'Bu hikoya shu yerda tugamaydi. Eng yaxshi lahzalar hali oldinda.';
  }
  story.revisionNote = instruction;
  return story;
}
