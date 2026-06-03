import { Router } from "express";
import { processMetaWebhook, verifyMetaWebhook } from "./meta.handler";
import { incomingCallTwiml, processTwilioSms, processTwilioVoice } from "./twilio.handler";

export const webhooksRouter = Router();

webhooksRouter.get("/meta", (req, res) => {
  const challenge = verifyMetaWebhook(req.query);

  if (!challenge) {
    res.sendStatus(403);
    return;
  }

  res.status(200).send(challenge);
});

webhooksRouter.post("/meta", (req, res) => {
  res.status(200).json({ ok: true });

  setImmediate(() => {
    processMetaWebhook(req.body).catch((error) => {
      console.warn("[WEBHOOK] Error no controlado en procesamiento Meta", error);
    });
  });
});

webhooksRouter.post("/twilio/sms", (req, res) => {
  res.status(200).json({ ok: true });

  setImmediate(() => {
    processTwilioSms(req.body).catch((error) => {
      console.warn("[WEBHOOK] Error no controlado en SMS Twilio", error);
    });
  });
});

webhooksRouter.post("/twilio/voice", (req, res) => {
  res.type("text/xml").status(200).send(incomingCallTwiml());

  setImmediate(() => {
    processTwilioVoice(req.body).catch((error) => {
      console.warn("[WEBHOOK] Error no controlado en Voice Twilio", error);
    });
  });
});
