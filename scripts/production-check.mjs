const required=['APP_URL','BASE_DOMAIN','TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','ADMIN_TOKEN'];
const recommended=['DATABASE_URL','OPENAI_API_KEY','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','R2_PUBLIC_BASE_URL'];
let bad=false;
for(const k of required){ if(!process.env[k]){ console.error(`MISSING required: ${k}`); bad=true; } else console.log(`OK required: ${k}`); }
for(const k of recommended){ console.log(`${process.env[k]?'OK':'WARN'} recommended: ${k}`); }
if(String(process.env.DEMO_MODE||'false')==='true'){console.error('MISSING safety: DEMO_MODE must be false in production');bad=true;}
if(bad) process.exit(1);
console.log('Production configuration looks ready.');
