export const triggerCatalog = {
  form: {
    type: 'n8n-nodes-base.formTrigger',
    typeVersion: 2,
    parameters: { formTitle: 'Formulario' }
  },
  webhook: {
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    parameters: { path: 'pendiente', httpMethod: 'POST' }
  },
  schedule: {
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1,
    parameters: {
      rule: { interval: [{ field: 'hours', hoursInterval: 24 }] }
    }
  },
  email_received: {
    type: 'n8n-nodes-base.emailReadImap',
    typeVersion: 1,
    parameters: { mailbox: '«PENDIENTE: buzón IMAP»' }
  },
  manual: {
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    parameters: {}
  }
};

export const stepCatalog = {
  save_to_sheet: {
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4,
    parameters: {
      operation: 'append',
      documentId: '«PENDIENTE: hoja de cálculo»',
      sheetName: '«PENDIENTE: pestaña»'
    }
  },
  send_email: {
    type: 'n8n-nodes-base.emailSend',
    typeVersion: 2,
    parameters: {
      fromEmail: '«PENDIENTE: correo remitente»',
      toEmail: '«PENDIENTE: correo destino»',
      subject: '«PENDIENTE: asunto»',
      emailType: 'text',
      message: '«PENDIENTE: mensaje»'
    }
  },
  send_whatsapp: {
    type: 'n8n-nodes-base.whatsApp',
    typeVersion: 1,
    parameters: {
      operation: 'send',
      recipientPhoneNumber: '«PENDIENTE: número de WhatsApp»',
      textBody: '«PENDIENTE: mensaje»'
    }
  },
  send_telegram: {
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1,
    parameters: {
      operation: 'sendMessage',
      chatId: '«PENDIENTE: chat de Telegram»',
      text: '«PENDIENTE: mensaje»'
    }
  },
  notify_slack: {
    type: 'n8n-nodes-base.slack',
    typeVersion: 2,
    parameters: {
      resource: 'message',
      operation: 'post',
      channel: '«PENDIENTE: canal de Slack»',
      text: '«PENDIENTE: mensaje»'
    }
  },
  http_request: {
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4,
    parameters: {
      method: 'POST',
      url: '«PENDIENTE: URL»',
      sendBody: true,
      jsonBody: '«PENDIENTE: cuerpo JSON»'
    }
  },
  set_fields: {
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    parameters: { mode: 'manual', assignments: { assignments: [] }, includeOtherFields: true }
  },
  wait: {
    type: 'n8n-nodes-base.wait',
    typeVersion: 1,
    parameters: { resume: 'timeInterval', amount: 1, unit: 'hours' }
  },
  respond_webhook: {
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1,
    parameters: {
      respondWith: 'json',
      responseBody: '«PENDIENTE: respuesta»'
    }
  }
};
