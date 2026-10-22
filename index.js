const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ── Variables de entorno (se configuran en Railway) ──────────────────────────
const VERIFY_TOKEN    = (process.env.VERIFY_TOKEN   || 'parteconestilo2024').trim();
const PHONE_NUMBER_ID = (process.env.PHONE_NUMBER_ID || '').trim();
const ACCESS_TOKEN    = (process.env.ACCESS_TOKEN    || '').replace(/[\r\n\s]+/g, '');
const ADMIN_NUMBER    = (process.env.ADMIN_NUMBER    || '').trim();

// ── Estado de conversaciones en memoria ─────────────────────────────────────
const userStates = {};

// ── Webhook: verificación de Meta ───────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── Webhook: mensajes entrantes ──────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;

    const msg  = messages[0];
    const from = msg.from;
    let input  = '';

    if (msg.type === 'text') {
      input = msg.text.body.trim().toLowerCase();
    } else if (msg.type === 'interactive') {
      if (msg.interactive.type === 'button_reply') {
        input = msg.interactive.button_reply.id;
      } else if (msg.interactive.type === 'list_reply') {
        input = msg.interactive.list_reply.id;
      }
    }

    await handleMessage(from, input);
  } catch (e) {
    console.error('Error en webhook:', e.message);
  }
});

// ── Router principal ─────────────────────────────────────────────────────────
async function handleMessage(from, input) {
  const state = userStates[from] || {};
  const step  = state.step || 'new';

  if (step.startsWith('order_'))   { await handleOrderFlow(from, input, state);   return; }
  if (step.startsWith('waiting_')) { await handleWaitingState(from, input, state); return; }

  switch (input) {
    // ── Saludo / bienvenida ────────────────────────────────────────────────
    case '':
    case 'hola': case 'hi': case 'hello': case 'buenas': case 'buenos días':
    case 'inicio': case 'menu': case 'main_back':
      if (step === 'new') await sendWelcome(from);
      else await sendMainMenu(from);
      userStates[from] = { step: 'main_menu' };
      break;

    // ── Menú principal ─────────────────────────────────────────────────────
    case 'opt_impresas':   await sendImpresasMenu(from);  break;
    case 'opt_digitales':  await sendDigitalesMenu(from); break;
    case 'opt_papeleria':  await sendPapeleriaMenu(from); break;
    case 'opt_tienda':     await sendTiendaMenu(from);    break;
    case 'opt_impresion':  await sendImpresionMenu(from); break;
    case 'opt_pedido':     await sendPedidoMenu(from);    break;
    case 'opt_faq':        await sendFAQ(from);           break;
    case 'opt_persona':    await sendHumano(from);        break;

    // ── Impresas ───────────────────────────────────────────────────────────
    case 'imp_catalogo':
      await sendText(from, '🌐 Puedes ver todos nuestros diseños aquí:\nhttps://www.parteconestilo.cl/partesdematrimonio\n\nSi ya elegiste un diseño, ¡escríbenos! 😊');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'imp_personalizar', title: 'Personalizar diseño' },
        { id: 'opt_persona',      title: 'Hablar con nosotras' },
        { id: 'main_back',        title: 'Menú principal' }
      ]);
      break;

    case 'imp_personalizar':
      await sendText(from, '¡Genial! 🎨 Nuestros diseños se pueden personalizar en colores, tipografía, imágenes y texto.\n\nAlgunos cambios más elaborados pueden tener un costo adicional.\n\nPara comenzar:\n1️⃣ Revisa el catálogo en parteconestilo.cl/partesdematrimonio\n2️⃣ Elige el diseño que más te guste\n3️⃣ Llena el formulario de solicitud en la misma página\n\nUna vez recibido, te enviaremos un correo con la cotización y los pasos a seguir 💌');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'imp_catalogo', title: 'Ver catálogo' },
        { id: 'opt_persona',  title: 'Hablar con nosotras' },
        { id: 'main_back',    title: 'Menú principal' }
      ]);
      break;

    case 'imp_nuevo':
      await sendText(from, '¡Me encanta que quieran algo único! 🌟\n\nPara diseños completamente personalizados hay un costo adicional de *$10.000 CLP por diseño* (se cobra una sola vez, no por unidad).\n\nPrimero necesito revisar tu idea.\n\n📩 Envíame tu referencia o idea aquí mismo y te cuento 😊');
      userStates[from] = { step: 'waiting_custom_design' };
      break;

    case 'imp_proceso':
      await sendText(from, '📋 *Así funciona el proceso:*\n\n1️⃣ Elige tu diseño en parteconestilo.cl/partesdematrimonio y llena el formulario\n2️⃣ Te enviamos un correo con la *cotización total* + solicitud de información\n3️⃣ Completas y nos reenvías la información\n4️⃣ Te enviamos un *bosquejo en PDF* para revisar\n5️⃣ Apruebas el bosquejo y realizas el *pago del 100%*\n6️⃣ Te confirmamos la *fecha de entrega o envío* 🎉\n\n⏱️ Listo en *1 a 2 semanas* desde el pago y aprobación del bosquejo\n📦 Mínimo: *25 unidades* (sin excepción)');
      await sendButtons(from, '¿Necesitas más información?', [
        { id: 'imp_retiro',  title: 'Retiro y envíos' },
        { id: 'imp_papeles', title: 'Tipos de papel' },
        { id: 'main_back',   title: 'Menú principal' }
      ]);
      break;

    case 'imp_retiro':
      await sendText(from, '🏠 *Retiro en tienda*\nÑuñoa, Santiago — metro Príncipe de Gales 🚇\n_(Te enviamos la dirección exacta al confirmar tu pedido)_\nNo atendemos visitas previas, pero podemos enviarte fotos o videos de los materiales 📸\n\n🚚 *Envío a domicilio — Chile Express*\nTú transfieres el costo del flete y nosotros lo gestionamos por ti.\nTiempo estimado: *1 a 4 días hábiles*');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'imp_proceso', title: 'Volver al proceso' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'imp_papeles':
      await sendImage(from, 'https://cdn.jsdelivr.net/gh/parteconestilo-spec/parteconestilo-bot@main/papeles.JPG', 'Papeles disponibles 🗒️');
      await sendText(from, '🗒️ *Papeles disponibles:*\n\n✅ *Sin costo adicional:*\n• Opalina Biancoflash Hilo\n• Opalina Biancoflash Lisa\n• Papel Kraft\n\n➕ *Con +$200 por unidad:*\n• Opalina Biancoflash Ivory\n• Opalina Biancoflash Hilo Rosa\n• Reciclado Alga Blanco\n\nPuedes tocar la imagen para verla más cerca 🔍\nTambién en parteconestilo.cl 🌐');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'imp_catalogo', title: 'Ver catálogo' },
        { id: 'imp_proceso',  title: 'Volver al proceso' },
        { id: 'main_back',    title: 'Menú principal' }
      ]);
      break;

    // ── Digitales ──────────────────────────────────────────────────────────
    case 'dig_que_incluye':
      await sendText(from, '💌 *Nuestras invitaciones digitales incluyen:*\n\n◦ Nombres de los novios(as)\n◦ Fecha y hora del evento\n◦ Lugar del evento\n◦ 1 frase o escritura a elección\n◦ 2 fotografías _(dependiendo del diseño)_\n◦ Confirmación de asistencia\n◦ Restricción alimentaria\n◦ Lista de regalos\n◦ Código de vestimenta\n◦ Playlist colaborativa\n◦ Se puede enviar por *WhatsApp* e *Email*\n\n_Son PDF interactivos: scroll y botones al mapa, lista de novios, playlist y más_ 📲\n_*(Sin cuenta regresiva, música ni animación)*_');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'dig_adicionales',  title: 'Ver adicionales' },
        { id: 'dig_prediseñada',  title: 'Ver prediseñadas' },
        { id: 'dig_personalizada', title: 'Quiero personalizada' }
      ]);
      break;

    case 'dig_adicionales':
      await sendText(from, '➕ *Adicionales para tu invitación digital:*\n\n📅 Itinerario — *$5.000*\n📸 1 fotografía extra — *$2.500*\n📸 2 fotografías extras — *$4.500*\n🔘 Botón adicional — *$3.000*\n\nSolo márcalos al momento de realizar tu pedido 🛒');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'dig_prediseñada',  title: 'Ver catálogo' },
        { id: 'dig_personalizada', title: 'Quiero personalizada' },
        { id: 'main_back',         title: 'Menú principal' }
      ]);
      break;

    case 'dig_prediseñada':
      await sendText(from, '¡Perfecto! Puedes ver y comprar desde nuestra web 🌐\n👉 https://www.parteconestilo.cl/invitaciones-digitales\n\nUna vez hecha la compra:\n1️⃣ Te llegará un *correo con un formulario* para completar\n2️⃣ Nos lo reenvías completado\n3️⃣ Te confirmamos la fecha en que estará lista\n⏱️ *3 a 5 días hábiles*\n4️⃣ Puedes solicitar cambios en la *información* _(no en diseño, colores ni tipografía)_\n\n¿Cómo prefieres pagar?');
      await sendButtons(from, '¿Cómo prefieres pagar?', [
        { id: 'dig_web',          title: 'Comprar en la web' },
        { id: 'dig_transferencia', title: 'Transferencia' },
        { id: 'dig_link_pago',    title: 'Solicitar link de pago' }
      ]);
      break;

    case 'dig_web':
      await sendText(from, '🌐 Puedes comprar directamente aquí:\n👉 https://www.parteconestilo.cl/invitaciones-digitales\n\nUna vez que realices la compra, recibirás el correo con los pasos a seguir 💌');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'dig_adicionales', title: 'Ver adicionales' },
        { id: 'main_back',       title: 'Menú principal' },
        { id: 'opt_persona',     title: 'Hablar con nosotras' }
      ]);
      break;

    case 'dig_transferencia':
      await sendText(from, '🏦 *Datos de transferencia:*\n\n🏦 *Banco:* [Tu banco]\n👤 *Nombre:* [Tu nombre completo]\n🔢 *RUT:* [Tu RUT]\n💳 *N° de cuenta:* [Tu número]\n📧 *Correo:* [Tu correo]\n\nUna vez transferido, envíanos el comprobante por aquí y te confirmamos 🙌');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'dig_adicionales', title: 'Ver adicionales' },
        { id: 'main_back',       title: 'Menú principal' },
        { id: 'opt_persona',     title: 'Hablar con nosotras' }
      ]);
      break;

    case 'dig_link_pago':
      await sendText(from, '💳 Con gusto te enviamos un link de pago.\n\nTe lo haremos llegar a la brevedad 🙌');
      if (ADMIN_NUMBER) await sendText(ADMIN_NUMBER, `🔔 *LINK DE PAGO REQUERIDO*\nCliente: wa.me/${from}`);
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' },
        { id: 'opt_faq',     title: 'Preguntas frecuentes' }
      ]);
      break;

    case 'dig_personalizada':
      await sendText(from, '🎨 *Proceso para invitación digital personalizada:*\n\n1️⃣ Realizas el *pago* por la web o transferencia\n2️⃣ Coordinamos una *reunión online* para que me cuentes tu idea\n3️⃣ Horario: *lunes a viernes, 9:00 a 19:30 hrs*\n4️⃣ Te envío el formulario con los datos del matrimonio\n5️⃣ Una vez que lo reenvíes, te confirmo la fecha de entrega\n⏱️ *5 a 7 días hábiles*\n6️⃣ Puedes solicitar cambios en diseño, colores, tipografía, todo ✏️\n\nEscríbeme aquí y te contactaré a la brevedad 🌿');
      userStates[from] = { step: 'waiting_personalized_digital' };
      break;

    // ── Papelería ──────────────────────────────────────────────────────────
    case 'pap_catalogo':
      await sendText(from, '🔍 Puedes ver nuestros complementos aquí:\n👉 https://www.parteconestilo.cl/recuerdosymas-1\n\n¿Tienes alguna consulta? 😊');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'pap_personalizada', title: 'Solicitar personalizada' },
        { id: 'main_back',         title: 'Menú principal' },
        { id: 'opt_persona',       title: 'Hablar con nosotras' }
      ]);
      break;

    case 'pap_personalizada':
      await sendText(from, '¡Con gusto lo evalúo! 😊\n\nEnvíame aquí mismo tu referencia o idea (imagen, descripción, link, etc.) 📎\n\nUna vez que la revise, te confirmo si puedo realizarla y te envío la cotización 🌿');
      userStates[from] = { step: 'waiting_papeleria_ref' };
      break;

    // ── Tienda ─────────────────────────────────────────────────────────────
    case 'tienda_ir':
      await sendText(from, '🛒 Visita nuestra tienda online:\n👉 https://www.parteconestilo.cl/category/all-products\n\nEncuentra sellos de lacre, flores, sobres, rodillo adhesivo y más 🌿');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Preguntas frecuentes' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'opt_pregunta':
      await sendFAQ(from);
      break;

    // ── Pedido directo ─────────────────────────────────────────────────────
    case 'ped_impresa':
      userStates[from] = { step: 'order_impresa_cantidad', order: { tipo: 'impresa' } };
      await sendText(from, '¡Perfecto! Te haré algunas preguntas rápidas 📋\n\n*¿Cuántas invitaciones necesitas?*\n_(mínimo 25 unidades)_');
      break;

    case 'ped_digital':
      userStates[from] = { step: 'order_digital_diseño', order: { tipo: 'digital' } };
      await sendText(from, '¿Qué diseño te interesa? 📱\n\nVe el catálogo en: https://www.parteconestilo.cl/invitaciones-digitales\n\nEscribe el nombre del diseño (ej: Javiera, Carolina, Viñedo…)\n\nO escribe *personalizado* si deseas uno a tu gusto.');
      break;

    // ── FAQ individuales ───────────────────────────────────────────────────
    case 'faq_minimo':
      await sendText(from, '📦 El mínimo de invitaciones impresas es de *25 unidades*, sin excepción 📌');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'faq_retiro':
      await sendText(from, '📍 Retiro en *Ñuñoa, Santiago*, cerca del metro Príncipe de Gales 🚇\n\n_(No atendemos visitas previas, pero podemos enviarte fotos o videos de los materiales 📸)_');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'faq_envios':
      await sendText(from, '🚚 Sí, enviamos a todo Chile por *Chile Express*\n\nTú transfieres el costo del flete y nosotros lo gestionamos por ti.\nTiempo estimado: *1 a 4 días hábiles* desde Santiago.');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'faq_tiempos':
      await sendText(from, '⏱️ *Tiempos de producción:*\n\n💌 *Invitaciones impresas:* 1 a 2 semanas desde el pago + aprobación del bosquejo\n📱 *Digitales prediseñadas:* 3 a 5 días hábiles desde que nos reenvíes el formulario\n🎨 *Digitales personalizadas:* 5 a 7 días hábiles desde que nos reenvíes el formulario');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'faq_pago':
      await sendText(from, '💵 *¿Cómo se paga?*\n\n📱 *Invitaciones digitales*\nPago del *100% al momento de la compra*\n◦ 💳 Tarjeta de débito o crédito (las cuotas que prefieras)\n◦ 🏦 Transferencia bancaria\n◦ 💳 Link de pago\n\n💌 *Invitaciones impresas*\nPago del *100% al aprobar el bosquejo*\n◦ 💳 Link de pago (tarjeta de tu preferencia)\n◦ 🏦 Transferencia bancaria');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'faq_papeles':
      await sendImage(from, 'https://cdn.jsdelivr.net/gh/parteconestilo-spec/parteconestilo-bot@main/papeles.JPG', 'Papeles disponibles 🗒️');
      await sendText(from, '📄 *Papeles disponibles:*\n\n✅ *Sin costo adicional:*\n• Opalina Biancoflash Hilo\n• Opalina Biancoflash Lisa\n• Papel Kraft\n\n➕ *Con +$200 por unidad:*\n• Opalina Biancoflash Ivory\n• Opalina Biancoflash Hilo Rosa\n• Reciclado Alga Blanco\n\nPuedes tocar la imagen para verla más cerca 🔍');
      await sendButtons(from, '¿Necesitas algo más?', [
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' }
      ]);
      break;

    case 'faq_temas':
      await sendText(from, '🎨 ¡Sí! Siempre que el diseño vaya con nuestro estilo, con gusto lo evaluamos 💌\n\nEscríbenos y cuéntanos tu idea 😊');
      await sendButtons(from, '¿Qué deseas hacer?', [
        { id: 'opt_persona', title: 'Hablar con nosotras' },
        { id: 'opt_faq',     title: 'Más preguntas' },
        { id: 'main_back',   title: 'Menú principal' }
      ]);
      break;

    default:
      if (step === 'new' || step === 'main_menu') {
        await sendWelcome(from);
        userStates[from] = { step: 'main_menu' };
      }
      break;
  }
}

// ── Flujo de pedidos ─────────────────────────────────────────────────────────
async function handleOrderFlow(from, input, state) {
  const order = state.order || {};

  switch (state.step) {

    // IMPRESA
    case 'order_impresa_cantidad': {
      const n = parseInt(input);
      if (isNaN(n) || n < 25) {
        await sendText(from, '📌 El mínimo es de *25 unidades*. ¿Cuántas invitaciones necesitas?');
      } else {
        order.cantidad = n;
        userStates[from] = { step: 'order_impresa_diseño', order };
        await sendText(from, `¡Perfecto, ${n} invitaciones! 🌿\n\n*¿Cuál es el nombre del diseño que te interesa?*\nVe el catálogo en: https://www.parteconestilo.cl/partesdematrimonio`);
      }
      break;
    }
    case 'order_impresa_diseño':
      order.diseño = input;
      userStates[from] = { step: 'order_impresa_nombre', order };
      await sendText(from, `Diseño: *${input}* ✅\n\n*¿Cuál es el nombre de la novia o novio que realiza el pedido?*`);
      break;

    case 'order_impresa_nombre':
      order.nombre = input;
      userStates[from] = { step: 'order_impresa_email', order };
      await sendText(from, '*¿Cuál es tu email?*');
      break;

    case 'order_impresa_email':
      order.email = input;
      userStates[from] = { step: 'order_impresa_papel', order };
      await sendImage(from, 'https://cdn.jsdelivr.net/gh/parteconestilo-spec/parteconestilo-bot@main/papeles.JPG', 'Papeles disponibles 🗒️');
      await sendListMessage(from,
        '🗒️ *¿Qué papel prefieres?*',
        'Ver papeles',
        [{
          title: 'Sin costo adicional',
          rows: [
            { id: 'papel_hilo',  title: 'Biancoflash Hilo' },
            { id: 'papel_lisa',  title: 'Biancoflash Lisa' },
            { id: 'papel_craft', title: 'Papel Kraft' }
          ]
        }, {
          title: 'Con costo adicional',
          rows: [
            { id: 'papel_ivory', title: 'Ivory +$200' },
            { id: 'papel_rosa',  title: 'Hilo Rosa +$200' },
            { id: 'papel_alga',  title: 'Alga Blanco +$200' }
          ]
        }]
      );
      break;

    case 'order_impresa_papel': {
      const papeles = {
        papel_hilo:  'Biancoflash Hilo',
        papel_lisa:  'Biancoflash Lisa',
        papel_craft: 'Papel Kraft',
        papel_ivory: 'Biancoflash Hilo Ivory (+$200)',
        papel_rosa:  'Biancoflash Hilo Rosa (+$200)',
        papel_alga:  'Reciclado Alga Blanco (+$200)'
      };
      order.papel = papeles[input] || input;
      userStates[from] = { step: 'order_impresa_adicionales', order };
      await sendText(from,
        `Papel: *${order.papel}* ✅\n\n*¿Deseas agregar algún adicional?*\n\nEscribe los que desees o escribe *"ninguno"*:\n\n✏️ Nombres escritos con pluma a máquina: *+$400*\n🔴 Sello de lacre: *+$400*\n💎 Sello de lacre con iniciales: *+$550*\n📮 Estampillas: *+$200*\n🗺️ Mapa al reverso de la invitación: *+$900*\n🌿 Flor decorativa (ej: ramita de lavanda): *+$350*\n🖨️ Nombres de invitados impresos: *+$200*`
      );
      break;
    }
    case 'order_impresa_adicionales':
      order.adicionales = input;
      userStates[from] = { step: 'order_impresa_comentarios', order };
      await sendText(from, '*¿Tienes algún comentario o consulta adicional?*\n\nEscribe tu comentario o envía *"no"* si todo está claro 😊');
      break;

    case 'order_impresa_comentarios': {
      order.comentarios = (input === 'no') ? 'Sin comentarios' : input;
      userStates[from] = { step: 'main_menu' };
      await sendText(from,
        `¡Listo! Recibimos tu solicitud 🎉\n\n*Resumen:*\n📦 Cantidad: ${order.cantidad} invitaciones\n🎨 Diseño: ${order.diseño}\n👤 Nombre: ${order.nombre}\n📧 Email: ${order.email}\n📄 Papel: ${order.papel}\n➕ Adicionales: ${order.adicionales}\n\nNos pondremos en contacto a la brevedad para confirmarte la cotización y los pasos a seguir 💌\n\n_El pago se realiza una vez que apruebes el bosquejo_ 🌿`
      );
      if (ADMIN_NUMBER) {
        await sendText(ADMIN_NUMBER,
          `🔔 *NUEVO PEDIDO — IMPRESA*\n\n📦 Cantidad: ${order.cantidad}\n🎨 Diseño: ${order.diseño}\n👤 Cliente: ${order.nombre}\n📧 Email: ${order.email}\n📄 Papel: ${order.papel}\n➕ Adicionales: ${order.adicionales}\n💬 Comentarios: ${order.comentarios}\n🔗 WA: wa.me/${from}`
        );
      }
      await sendButtons(from, '¿En qué más te puedo ayudar?', [
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' },
        { id: 'opt_faq',     title: 'Preguntas frecuentes' }
      ]);
      break;
    }

    // DIGITAL
    case 'order_digital_diseño':
      order.diseño         = input;
      order.tipo_digital   = (input.toLowerCase() === 'personalizado') ? 'personalizado' : 'prediseñado';
      userStates[from]     = { step: 'order_digital_nombre', order };
      await sendText(from, `Diseño: *${input}* ✅\n\n*¿Cuál es tu nombre?*`);
      break;

    case 'order_digital_nombre':
      order.nombre     = input;
      userStates[from] = { step: 'order_digital_email', order };
      await sendText(from, '*¿Cuál es tu email?*');
      break;

    case 'order_digital_email': {
      order.email      = input;
      userStates[from] = { step: 'main_menu' };

      if (order.tipo_digital === 'personalizado') {
        await sendText(from,
          `¡Listo! 🎉\n\n*Nombre:* ${order.nombre}\n*Email:* ${order.email}\n*Diseño:* Personalizado\n\nMe pondré en contacto contigo a la brevedad para coordinar nuestra reunión 🌿\n_Horario: lunes a viernes, 9:00 a 19:30 hrs_`
        );
        if (ADMIN_NUMBER) {
          await sendText(ADMIN_NUMBER,
            `🔔 *NUEVO PEDIDO — DIGITAL PERSONALIZADO*\n\n👤 ${order.nombre}\n📧 ${order.email}\n🔗 wa.me/${from}\n\n⚠️ Requiere reunión online`
          );
        }
      } else {
        await sendText(from,
          `¡Listo! 🎉\n\n*Resumen:*\n🎨 Diseño: ${order.diseño}\n👤 Nombre: ${order.nombre}\n📧 Email: ${order.email}\n\n¿Cómo prefieres pagar?`
        );
        await sendButtons(from, '¿Cómo prefieres pagar?', [
          { id: 'dig_web',          title: 'Comprar en la web' },
          { id: 'dig_transferencia', title: 'Transferencia' },
          { id: 'dig_link_pago',    title: 'Solicitar link de pago' }
        ]);
        if (ADMIN_NUMBER) {
          await sendText(ADMIN_NUMBER,
            `🔔 *NUEVO PEDIDO — DIGITAL PREDISEÑADO*\n\n🎨 Diseño: ${order.diseño}\n👤 ${order.nombre}\n📧 ${order.email}\n🔗 wa.me/${from}`
          );
        }
      }
      break;
    }
    default:
      await sendMainMenu(from);
  }
}

// ── Estados de espera (texto libre) ─────────────────────────────────────────
async function handleWaitingState(from, input, state) {
  switch (state.step) {
    case 'waiting_custom_design':
      if (ADMIN_NUMBER) await sendText(ADMIN_NUMBER, `🔔 *DISEÑO PERSONALIZADO*\nCliente: wa.me/${from}\nIdea: ${input}`);
      await sendText(from, '¡Gracias! Recibí tu idea 🌿 La revisaré y te confirmo si podemos realizarla a la brevedad 😊');
      userStates[from] = { step: 'main_menu' };
      await sendButtons(from, '¿En qué más te puedo ayudar?', [
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' },
        { id: 'opt_faq',     title: 'Preguntas frecuentes' }
      ]);
      break;

    case 'waiting_papeleria_ref':
      if (ADMIN_NUMBER) await sendText(ADMIN_NUMBER, `🔔 *PAPELERÍA PERSONALIZADA*\nCliente: wa.me/${from}\nReferencia: ${input}`);
      await sendText(from, '¡Gracias! Recibí tu referencia 🌿 La revisaré y te confirmo si puedo realizarla con la cotización a la brevedad 😊');
      userStates[from] = { step: 'main_menu' };
      await sendButtons(from, '¿En qué más te puedo ayudar?', [
        { id: 'main_back',   title: 'Menú principal' },
        { id: 'opt_persona', title: 'Hablar con nosotras' },
        { id: 'opt_faq',     title: 'Preguntas frecuentes' }
      ]);
      break;

    case 'waiting_print_file':
      if (ADMIN_NUMBER) await sendText(ADMIN_NUMBER, `🔔 *IMPRESIÓN Y CORTE*\nCliente: wa.me/${from}\nArchivo adjunto en el chat`);
      await sendText(from, '¡Gracias! Recibí tu archivo 📎 Te cotizo a la brevedad según formato, papel y cantidad 😊');
      userStates[from] = { step: 'main_menu' };
      break;

    case 'waiting_personalized_digital':
      if (ADMIN_NUMBER) await sendText(ADMIN_NUMBER, `🔔 *DIGITAL PERSONALIZADO*\nCliente: wa.me/${from}\nMensaje: ${input}`);
      await sendText(from, '¡Genial! Te contactaré pronto para coordinar nuestra reunión 🌿\n_Atención: lunes a viernes, 9:00 a 19:30 hrs_');
      userStates[from] = { step: 'main_menu' };
      break;

    default:
      await sendMainMenu(from);
      userStates[from] = { step: 'main_menu' };
  }
}

// ── Menús principales ────────────────────────────────────────────────────────
async function sendWelcome(from) {
  await sendText(from, '👋 ¡Hola! Bienvenid@ a *Parte con Estilo* 💌\nEstoy aquí para ayudarte con todo lo que necesites.');
  await sendMainMenu(from);
}

async function sendMainMenu(from) {
  await sendListMessage(from,
    '¿Qué estás buscando hoy? 🌿',
    'Ver opciones',
    [{
      title: '✨ Nuestros productos',
      rows: [
        { id: 'opt_impresas',  title: '💌 Invitaciones impresas',   description: 'Bodas y eventos especiales' },
        { id: 'opt_digitales', title: '📱Invitaciones digitales',    description: 'PDF interactivo' },
        { id: 'opt_papeleria', title: '🎀 Complementos',              description: 'Menús, números de mesa y más' },
        { id: 'opt_tienda',    title: '🛍️ Tienda y materiales',      description: 'Sellos, flores, sobres y más' },
        { id: 'opt_impresion', title: '✂️ Servicio de impresión',    description: 'Ya tienes tu diseño' }
      ]
    }, {
      title: '📋 Más opciones',
      rows: [
        { id: 'opt_pedido',  title: '🛒 Hacer mi pedido',           description: 'Sin ir a la página web' },
        { id: 'opt_faq',     title: '❓ Preguntas frecuentes',       description: 'Dudas comunes' },
        { id: 'opt_persona', title: '👩 Hablar con nosotras',        description: 'Lun-Vie 9:30-18:00' }
      ]
    }]
  );
}

async function sendImpresasMenu(from) {
  await sendListMessage(from,
    '💌 Invitaciones impresas — ¿qué te gustaría hacer? 🌿',
    'Ver opciones',
    [{
      title: '💌 Opciones',
      rows: [
        { id: 'imp_catalogo',    title: '📖 Ver catálogo',           description: 'Todos nuestros diseños' },
        { id: 'imp_personalizar', title: '🎨 Personalizar diseño',   description: 'Colores, tipografía y más' },
        { id: 'imp_nuevo',       title: '✨ Diseño único',           description: '+$10.000 por diseño (único)' },
        { id: 'imp_proceso',     title: '📋 Cómo funciona',          description: 'Pasos y tiempos' },
        { id: 'main_back',       title: '↩️ Volver al menú',         description: '' }
      ]
    }]
  );
}

async function sendDigitalesMenu(from) {
  await sendListMessage(from,
    '📱 Invitaciones digitales — ¿qué te gustaría hacer? 🌿',
    'Ver opciones',
    [{
      title: '📱 Opciones',
      rows: [
        { id: 'dig_prediseñada',   title: '🖥️ Prediseñada',             description: 'Desde la página web' },
        { id: 'dig_personalizada', title: '🎨 Diseño personalizado',     description: 'Todo a tu gusto' },
        { id: 'dig_que_incluye',   title: '📦 ¿Qué incluye?',           description: 'Ver todo lo que viene' },
        { id: 'dig_adicionales',   title: '➕ Adicionales',              description: 'Itinerario, fotos extra y más' },
        { id: 'main_back',         title: '↩️ Volver al menú',           description: '' }
      ]
    }]
  );
}

async function sendPapeleriaMenu(from) {
  await sendText(from, '🎀 ¿Necesitas papelería adicional para tu boda? ✨');
  await sendButtons(from, '¿Qué te gustaría hacer?', [
    { id: 'pap_catalogo',    title: 'Ver catálogo' },
    { id: 'pap_personalizada', title: 'Solicitar personalizada' },
    { id: 'main_back',       title: 'Menú principal' }
  ]);
}

async function sendTiendaMenu(from) {
  await sendText(from, '🛍️ En nuestra tienda online encontrarás todo para crear tus propias invitaciones 🌿\n\n◦ Sellos de lacre\n◦ Flores\n◦ Sobres\n◦ Rodillo adhesivo\n◦ Y otros materiales');
  await sendButtons(from, '¿Qué deseas hacer?', [
    { id: 'tienda_ir',    title: 'Ir a la tienda' },
    { id: 'opt_pregunta', title: 'Tengo una pregunta' },
    { id: 'main_back',    title: 'Menú principal' }
  ]);
}

async function sendImpresionMenu(from) {
  await sendText(from, '✂️ Si ya tienes tu diseño listo, podemos imprimirlo y cortarlo para ti.\n\nEnvíame tu archivo aquí mismo y te cotizo 📎');
  userStates[from] = { step: 'waiting_print_file' };
  await sendButtons(from, '¿Necesitas algo más?', [
    { id: 'opt_persona', title: 'Hablar con nosotras' },
    { id: 'main_back',   title: 'Menú principal' },
    { id: 'opt_faq',     title: 'Preguntas frecuentes' }
  ]);
}

async function sendPedidoMenu(from) {
  await sendText(from, '¡Genial, te ayudo a hacer tu pedido! 🌿');
  await sendButtons(from, '¿Qué tipo de invitación deseas pedir?', [
    { id: 'ped_impresa', title: '💌 Impresa' },
    { id: 'ped_digital', title: '📱 Digital' },
    { id: 'main_back',   title: '↩️ Menú principal' }
  ]);
}

async function sendFAQ(from) {
  await sendListMessage(from,
    'Aquí las respuestas más comunes 👇',
    'Ver preguntas',
    [{
      title: 'Preguntas frecuentes',
      rows: [
        { id: 'faq_minimo',  title: '¿Cuál es el mínimo?',     description: 'Cantidad mínima de invitaciones' },
        { id: 'faq_retiro',  title: '¿Dónde retiro?',           description: 'Ubicación de retiro' },
        { id: 'faq_envios',  title: '¿Hacen envíos?',           description: 'Envíos a todo Chile' },
        { id: 'faq_tiempos', title: '¿Cuánto demoran?',         description: 'Tiempos de producción' },
        { id: 'faq_pago',    title: '¿Cómo se paga?',           description: 'Métodos de pago' },
        { id: 'faq_papeles', title: '¿Qué papeles tienen?',     description: 'Tipos de papel disponibles' },
        { id: 'faq_temas',   title: '¿Aceptan otros temas?',    description: 'No solo bodas' },
        { id: 'opt_persona', title: 'Hablar con una persona',   description: 'Atención personalizada' }
      ]
    }]
  );
}

async function sendHumano(from) {
  await sendText(from, '¡Con gusto te ayudamos personalmente! 🙌\n\nUn momento, te conectamos con nosotros.\n_Atención: lunes a viernes, 9:30 a 18:00 hrs_ 💌');
  if (ADMIN_NUMBER) {
    await sendText(ADMIN_NUMBER, `🔔 *ATENCIÓN REQUERIDA*\nUn cliente quiere hablar con una persona.\n🔗 wa.me/${from}`);
  }
}

// ── Funciones de envío a la API de WhatsApp ──────────────────────────────────
async function sendText(to, body) {
  await callAPI({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } });
}

async function sendImage(to, imageUrl, caption) {
  await callAPI({
    messaging_product: 'whatsapp', to,
    type: 'image',
    image: { link: imageUrl, caption: caption || '' }
  });
}

async function sendButtons(to, text, buttons) {
  await callAPI({
    messaging_product: 'whatsapp', to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text },
      action: {
        buttons: buttons.map(b => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.substring(0, 20) }
        }))
      }
    }
  });
}

async function sendListMessage(to, text, buttonText, sections) {
  await callAPI({
    messaging_product: 'whatsapp', to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text },
      action: {
        button: buttonText,
        sections: sections.map(s => ({
          title: s.title,
          rows: s.rows.map(r => ({
            id:    r.id,
            title: r.title.substring(0, 24)
          }))
        }))
      }
    }
  });
}

async function callAPI(data) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
      data,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('Error API WhatsApp:', e.response?.data || e.message);
  }
}

// ── Iniciar servidor ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Bot corriendo en puerto ${PORT}`));
