import type { Strings } from "../freelancers";

export const es: Strings = {
  countryCode: "es",
  company: "Robledal Diseño de Producto",
  workspaceName: "Freelancers",
  website: "https://robledal-diseno.example",
  phones: { mobile: { templates: ["+34 600 000 ###"], start: 300 } },
  selfTitle: "Diseñador UX y de producto freelance",
  lists: {
    organization: ["Cliente", "Clientes", "Empresas para las que trabajo o con las que hablo de trabajo."],
    contact: ["Contacto", "Contactos", "Las personas con las que trabajo en mis clientes."],
    deal: ["Consulta", "Consultas", "Posibles proyectos, desde el primer mensaje hasta la decisión del cliente."],
    project: ["Proyecto", "Proyectos", "Trabajo acordado, con tarifa diaria, días y honorarios calculados."],
    task: ["Tarea", "Tareas", "Lo que he prometido hacer, con fecha de vencimiento."],
  },
  fields: {
    dealValue: "Valor estimado",
    weightedValue: "Valor ponderado",
    relationship: "Relación de trabajo",
    clientSince: "Cliente desde",
    nextAction: "Próximo paso",
    nextActionDate: "Fecha del próximo paso",
    totalFees: "Honorarios totales",
    address: "Dirección",
    brief: "Briefing",
    files: "Archivos",
    website: "Sitio web",
    jobTitle: "Cargo",
    workType: "Tipo de trabajo",
    source: "Origen",
    decisionDate: "Fecha de decisión",
    projectStatus: "Estado",
    dayRate: "Tarifa diaria",
    days: "Días",
    fee: "Honorarios",
    start: "Inicio",
    deadline: "Entrega",
    dueDate: "Fecha de vencimiento",
  },
  options: {
    relationship: { ongoing: "Continua", occasional: "Ocasional", new: "Nueva" },
    workType: {
      research: "Investigación de usuarios",
      productDesign: "Diseño de producto",
      designSystem: "Sistema de diseño",
      review: "Revisión UX",
    },
    source: {
      repeat: "Cliente existente",
      referral: "Recomendación",
      website: "Sitio web",
      network: "Red de contactos",
    },
    projectStatus: {
      planned: "Planificado",
      inProgress: "En curso",
      waiting: "Esperando feedback",
      done: "Terminado",
      billed: "Facturado",
    },
  },
  stages: {
    inquiry: "Consulta",
    firstCall: "Primera llamada",
    proposal: "Propuesta enviada",
    won: "Ganada",
    lost: "Perdida",
  },
  organizations: {
    tidewater: ["Marea Analytics S.L.", "Valencia", "marea-analytics.example", "Repaso de la propuesta con Carmen"],
    brightpath: [
      "Senda Educativa S.L.",
      "Madrid",
      "senda-educativa.example",
      "Taller de arranque para el flujo de onboarding",
    ],
    corvid: [
      "Cuervo Flotas Software",
      "Zaragoza",
      "cuervo-flotas.example",
      "Enseñar a José las primeras pantallas de despacho",
    ],
    meadow: [
      "Alondra Seguros S.A.",
      "Bilbao",
      "alondra-seguros.example",
      "Hacer seguimiento de la propuesta del formulario de siniestros",
    ],
    quill: ["Pluma y Cuenta", "Barcelona", "pluma-cuenta.example", "Llamada de alcance con Nuria"],
    fernhill: ["Colina Verde Energía", "Pamplona", "colina-verde-energia.example", "Responder a la consulta de Diego"],
    atlas: ["Atlas Movilidad", "Málaga", "atlas-movilidad.example", ""],
    juniper: ["Enebro Viajes", "Granada", "enebro-viajes.example", "Pedir a Alex los datos de uso actuales"],
  },
  addresses: {
    tidewater: ["Calle de Colón, 25", "46004", "V", 39.46908, -0.37231],
    brightpath: ["Calle de Alcalá, 42", "28014", "M", 40.41821, -3.69651],
    corvid: ["Calle de Alfonso I, 14", "50003", "Z", 41.65388, -0.8812],
    meadow: ["Gran Vía de Don Diego López de Haro, 45", "48011", "BI", 43.26331, -2.93752],
    quill: ["Passeig de Gràcia, 55", "08007", "B", 41.39252, 2.16393],
    fernhill: ["Avenida de Carlos III, 25", "31002", "NA", 42.81413, -1.63984],
    atlas: ["Calle Marqués de Larios, 5", "29015", "MA", 36.71954, -4.4215],
    juniper: ["Calle Recogidas, 20", "18002", "GR", 37.17255, -3.60176],
  },
  contacts: {
    priya: ["Carmen", "Fernández", "Directora de Producto"],
    marcus: ["Javier", "Martínez", "Responsable de Ingeniería"],
    rachel: ["Marta", "Cabrera", "Directora de Diseño"],
    tom: ["Rubén", "Molina", "Product manager"],
    dan: ["José", "Serrano", "CTO"],
    chris: ["Cristian", "Vidal", "Product manager"],
    laura: ["Raquel", "García", "Directora de Digital"],
    kevin: ["Álvaro", "Santos", "Product owner"],
    nina: ["Nuria", "Pérez", "Cofundadora"],
    sam: ["Diego", "Lozano", "Director de Marketing"],
    jenna: ["Irene", "Gil", "Responsable de Producto"],
    alex: ["Alex", "Ramos", "Propietario"],
  },
  deals: {
    tidewaterDashboard: ["Marea – rediseño del dashboard de analítica, fase 2", "Repasar la propuesta con Carmen"],
    tidewaterDesignSystem: ["Marea – auditoría del sistema de diseño", "Proyecto iniciado"],
    brightpathOnboarding: ["Senda – onboarding para docentes", "Proyecto iniciado"],
    brightpathMobile: ["Senda – revisión de usabilidad de la app móvil", "Enviar a Rubén dos opciones de alcance"],
    corvidDispatch: ["Cuervo – diseño del dashboard de despacho", "Proyecto iniciado"],
    meadowClaims: ["Alondra – rediseño del formulario de siniestros", "Hacer seguimiento de la propuesta con Raquel"],
    meadowPortal: ["Alondra – rediseño del portal de corredores", "Perdida frente a un equipo interno"],
    quillOnboarding: ["Pluma y Cuenta – prototipo del onboarding de la app", "Llamada de alcance con Nuria"],
    fernhillTariff: [
      "Colina Verde Energía – página del comparador de tarifas",
      "Responder a Diego con posibles fechas de inicio",
    ],
    atlasRider: ["Atlas Movilidad – rediseño de la app de pasajeros", "Perdida por presupuesto"],
    juniperRefresh: ["Enebro Viajes – renovación del planificador de viajes", "Pedir a Alex los datos de uso actuales"],
  },
  projects: {
    tidewaterAudit: "Marea – auditoría del sistema de diseño",
    brightpathOnboardingFlow: "Senda – onboarding para docentes",
    corvidDispatchDesign: "Cuervo – diseño del dashboard de despacho",
    juniperCheckout: "Enebro Viajes – auditoría UX del proceso de pago",
    meadowAccessibility: "Alondra – revisión de accesibilidad del área de clientes",
    brightpathQuiz: "Senda – creador de cuestionarios para docentes",
  },
  tasks: {
    walkthroughPrep: "Preparar el repaso de la propuesta de la fase 2 para Carmen",
    scopeOptions: "Redactar dos opciones de alcance para la revisión de la app móvil",
    kickoffAgenda: "Preparar la agenda del taller de arranque",
    followUpLaura: "Hacer seguimiento con Raquel de la propuesta del formulario de siniestros",
    replySam: "Responder a la consulta de Diego con posibles fechas de inicio",
    reviewQuillScreens: "Revisar las pantallas de onboarding actuales de Pluma y Cuenta",
    testimonial: "Pedir a Carmen un testimonio breve",
    corvidCheckIn: "Llamada trimestral de seguimiento con José",
  },
  views: {
    clients: "Lista de clientes",
    inquiries: "Tablero de consultas",
    projects: "Proyectos",
    nextActions: "Próximos pasos",
    openTasks: "Tareas abiertas",
    calendar: "Calendario de proyectos",
  },
  widgets: {
    openQuotes: "Propuestas abiertas",
    running: "Honorarios de proyectos en curso",
    fees: "Honorarios de proyectos en los últimos 12 meses",
    overdueTasks: "Tareas vencidas",
    byStage: "Valor de las consultas por etapa",
    byStatus: "Proyectos por estado",
    byClient: "Honorarios por cliente",
    feesByMonth: "Honorarios por mes de inicio",
    nextActions: "Próximos pasos, próximos 14 días",
    tasksMonth: "Tareas abiertas este mes",
  },
  files: {
    fernhillBrief: {
      name: "Briefing Colina Verde.pdf",
      lines: [
        "# Colina Verde Energía – briefing: página del comparador de tarifas",
        "De Diego Lozano, director de Marketing.",
        "## El problema",
        "Muchos visitantes abandonan nuestro comparador de tarifas en el segundo paso, donde introducen su consumo anual.",
        "| Paso | Visitantes | Continúan |",
        "| 1. Código postal | 10.000 | 74 % |",
        "| 2. Consumo anual | 7.400 | 38 % |",
        "| 3. Elegir una tarifa | 2.800 | 61 % |",
        "## Qué pedimos",
        "Una mirada externa con algunas entrevistas a usuarios y, después, un rediseño del comparador de tarifas que nuestros desarrolladores puedan construir.",
        "## Plazos y presupuesto",
        "Inicio en los próximos dos meses; presupuesto de unos 6.000 €.",
      ],
    },
    juniperBrief: {
      name: "Briefing planificador de viajes.docx",
      lines: [
        "# Enebro Viajes – renovación del planificador de viajes",
        "## Objetivo",
        "Menos planes de viaje abandonados en el móvil; el planificador se rediseñó por última vez hace cuatro años.",
        "## Encargo",
        "Una revisión UX breve con mejoras concretas, como la auditoría del proceso de pago, que usó tablas de antes y después con el mismo estilo que el comparador de tarifas.",
        "## Presupuesto",
        "Unos 3.500 €.",
      ],
    },
    tidewaterProposal: {
      name: "Propuesta fase 2.pdf",
      lines: [
        "# Marea Analytics – rediseño del dashboard, fase 2",
        "Preparada para Carmen Fernández y Javier Martínez.",
        "## Alcance",
        "| Parte | Días | Honorarios |",
        "| Investigación: cinco entrevistas a clientes | 5 | 4.500 € |",
        "| Diseño del nuevo dashboard | 10 | 9.500 € |",
        "| Total | 15 | 14.000 € |",
        "Con tres entrevistas en lugar de cinco, la investigación se queda en 3 días (2.700 €).",
      ],
    },
    tidewaterFindings: {
      name: "Resultados del test de usabilidad.md",
      lines: [
        "# Resultados del test de usabilidad – auditoría del sistema de diseño",
        "## Qué funciona",
        "Los botones y los campos de formulario son coherentes en todo el producto.",
        "## Qué no",
        "Tres selectores de fecha distintos; las tablas usan cuatro escalas de espaciado.",
        "## Siguiente",
        "Unificar primero los selectores de fecha; las tablas de los informes siguen el diseño del comparador de tarifas que probamos.",
      ],
    },
    corvidFeedback: {
      name: "Primeras pantallas – feedback.md",
      lines: [
        "# Primeras pantallas de despacho – feedback",
        "## José",
        "La vista de mapa es la entrada correcta; la lista de trabajos necesita la siguiente parada del conductor.",
        "## Cristian",
        "Los filtros deben mantenerse al cambiar de día. El feedback sobre la vista de turnos llega el jueves.",
      ],
    },
    interviews: {
      name: "Calendario de entrevistas.xlsx",
    },
  },
  interviewRows: [
    ["Docente", "Centro", "Día", "Hora"],
    ["Entrevista 1", "IES Ribera del Jarama", "Lunes", "15:30"],
    ["Entrevista 2", "CEIP Colina del Roble", "Martes", "16:00"],
    ["Entrevista 3", "IES Vistalago", "Miércoles", "15:00"],
    ["Entrevista 4", "Colegio Parque del Cedro", "Jueves", "16:30"],
  ],
  calendar: {
    name: "Llamadas con clientes",
    events: [
      "Repaso de la fase 2 con Marea",
      "Taller de arranque de Senda",
      "Llamada de alcance con Pluma y Cuenta",
      "Feedback sobre las pantallas de despacho con Cuervo",
    ],
  },
  trash: { contact: "Diego Lozano", deal: "Atlas Movilidad – auditoría de la app de conductores" },
  mate: {
    title: "Consulta a partir del briefing de Colina Verde",
    question:
      "He adjuntado Briefing Colina Verde.pdf. Crea una consulta a partir de este briefing y propón dos fechas de inicio.",
    answer:
      "Hecho. He creado la consulta **Colina Verde Energía – página del comparador de tarifas** en la etapa Consulta, vinculada a Colina Verde Energía y a Diego Lozano, con un valor estimado de 6.000 € y el origen Recomendación (Diego te encontró a través de Alondra). Briefing Colina Verde.pdf está adjunto en el campo Briefing de la consulta.\n\nDel briefing: los visitantes abandonan en el paso 2 del comparador de tarifas (consumo anual), donde solo continúa el 38 %. Diego pide algunas entrevistas a usuarios y un rediseño, con inicio en los próximos dos meses y un presupuesto de unos 6.000 €. A 900 € por día en investigación y 950 € en diseño, son unos 6–7 días.\n\n**Calendario de proyectos:**\n- Marea – auditoría del sistema de diseño dura hasta su entrega, dentro de unas tres semanas y media.\n- Cuervo – dashboard de despacho espera feedback y termina en unos diez días.\n- Senda – onboarding para docentes sigue entre cinco y seis semanas más.\n\n**Dos posibles inicios:**\n1. El lunes después de la entrega de Cuervo, dos días a la semana junto a Senda y Marea.\n2. El lunes después de entregar la auditoría de Marea, tres días a la semana.\n\nHe puesto como próximo paso «Responder a Diego con posibles fechas de inicio». Tu respuesta en el hilo sigue siendo un borrador, así que no se ha enviado nada.",
  },
  routines: {
    mondayPlan: {
      name: "Plan del lunes",
      task: "Cada lunes por la mañana, escribe un único resumen de solo lectura de mi semana. Lee los clientes y las consultas cuya Fecha del próximo paso configurada cae en los próximos siete días o ya ha pasado, los proyectos cuyo Estado es En curso o Esperando feedback con su Entrega, y las tareas abiertas por Fecha de vencimiento. Agrupa el resumen por días, nombra el cliente y el próximo paso, y pon primero lo vencido. Máximo 300 palabras. No modifiques ningún registro, borrador ni ajuste.",
      runs: [
        "Listados 6 próximos pasos y 2 entregas de proyectos de esta semana; 2 elementos estaban vencidos.",
        "Listados 4 próximos pasos y 1 entrega de proyecto; nada estaba vencido.",
      ],
      note: "No pude conectar con el proveedor del modelo en este intento, así que me detuve antes de leer nada. No se modificó nada; la ejecución del próximo lunes cubrirá la semana.",
    },
    draftInquiryReply: {
      name: "Borradores de respuesta a consultas nuevas",
      task: "Revisa el correo nuevo identificado por routine_trigger. Continúa solo cuando el remitente no coincida con ningún contacto existente a través de los canales de identidad, o cuando el correo pregunte por trabajo nuevo. Lee el Calendario de proyectos: proyectos con Estado Planificado, En curso o Esperando feedback desde el Inicio hasta la Entrega, para encontrar las primeras semanas libres. Guarda con save_message_draft un borrador de respuesta breve que dé las gracias al remitente, pregunte por el objetivo, el plazo y el rango de presupuesto, y proponga dos posibles fechas de inicio. Conserva un borrador existente. El borrador es para mi revisión; no lo envíes nunca y no cambies registros del CRM.",
      runs: [
        "Preparado un borrador de respuesta para Diego, de Colina Verde Energía, con dos posibles fechas de inicio.",
        "El correo era de un cliente existente sobre trabajo en curso, así que no hizo falta ningún borrador.",
      ],
    },
    quietClients: {
      name: "Retomar el contacto con clientes inactivos",
      task: 'El primer día de cada mes, busca los clientes cuya Relación de trabajo es Continua u Ocasional y que no tienen ningún proyecto con Estado Planificado, En curso o Esperando feedback. Para cada uno, lee el último proyecto y la última conversación vinculada. Si el cliente tiene una identidad de correo, guarda con save_message_draft un borrador breve de contacto que haga referencia al último proyecto; si no, crea una tarea "Retomar el contacto con <nombre del cliente>" con vencimiento esta semana. Evita una segunda tarea o borrador para el mismo cliente. No envíes nunca un mensaje.',
      runs: [
        "Preparados 2 borradores de contacto para Enebro Viajes y Alondra Seguros.",
        "Creada una tarea de contacto para Atlas Movilidad, que no tiene dirección de correo registrada.",
      ],
      note: "No pude conectar con el proveedor del modelo en este intento, así que me detuve antes de leer nada. No se modificó nada; la próxima ejecución, el primer día del mes, lo intentará de nuevo.",
    },
    dailyFollowUps: {
      name: "Cada mañana, borradores de seguimiento de las consultas que vencen hoy",
      task: 'Cada mañana de lunes a viernes, busca las consultas cuya Etapa es Consulta, Primera llamada o Propuesta enviada y cuya Fecha del próximo paso es hoy o anterior. Para cada una, lee el cliente, sus contactos, el texto del briefing o de la propuesta y la última conversación vinculada. Cuando el contacto tenga una identidad de correo y el último mensaje vinculado sea mío o tenga más de tres días, guarda con save_message_draft un borrador de seguimiento breve: con mi voz, una frase sobre el último intercambio y un próximo paso concreto. Cuando el contacto no tenga identidad de correo, crea una tarea "Hacer seguimiento con <nombre del contacto>" con vencimiento hoy y vinculada a la consulta. Conserva los borradores existentes y evita una segunda tarea o borrador para la misma consulta el mismo día. No cambies ninguna etapa ni fecha y no envíes nunca un mensaje.',
      runs: [
        "Guardados 2 borradores de seguimiento: Raquel García (Alondra, propuesta del formulario de siniestros) y Carmen Fernández (Marea, fase 2). Los borradores esperan en la bandeja de entrada.",
        "Vencía una consulta: guardado un borrador de seguimiento para Nuria Pérez (Pluma y Cuenta). Se conservó el borrador existente para Diego Lozano.",
        "Hoy no vencía ninguna consulta, así que no se redactó nada.",
      ],
    },
    requestsToTasks: {
      name: "Convertir peticiones de WhatsApp y LinkedIn en tareas",
      task: 'Hay un mensaje nuevo de WhatsApp o LinkedIn en routine_trigger. Continúa solo cuando el remitente coincida con un contacto a través de los canales de identidad y el mensaje me pida hacer algo o mencione una fecha. Lee el cliente del contacto, las consultas y los proyectos abiertos, y la conversación. Crea una tarea con el nombre de la petición, por ejemplo "Enviar a Rubén la guía de entrevistas", con la Fecha de vencimiento del mensaje (a tres días vista cuando no mencione ninguna), vinculada al contacto, al cliente y a la consulta o proyecto que corresponda. Evita una segunda tarea para la misma petición. No redactes ni envíes ninguna respuesta y no cambies ningún otro registro.',
      runs: [
        'Creada la tarea "Enviar a Rubén las opciones de alcance con precios" con vencimiento el jueves, vinculada a Rubén Molina, Senda Educativa y la revisión de usabilidad de la app móvil.',
        'Creada la tarea "Mostrar la siguiente parada del conductor en la lista de trabajos" con vencimiento el jueves, vinculada a José Serrano, Cuervo Flotas Software y el diseño del dashboard de despacho.',
        "El mensaje de Marta Cabrera solo confirmaba la hora del arranque, así que no hizo falta ninguna tarea.",
      ],
    },
  },
  wiki: {
    guide: {
      title: "Guía operativa",
      markdown: [
        "Max Bergmann trabaja por su cuenta como Robledal Diseño de Producto, diseñador UX y de producto para un puñado de clientes B2B, la mayoría desde hace varios años. Este espacio de trabajo contiene datos de demostración; todas las empresas y personas son ficticias.",
        "",
        "## Qué hay en este espacio de trabajo",
        "- **Clientes** son las empresas para las que trabajo o con las que hablo de trabajo. La lista de clientes muestra desde cuándo trabajamos juntos, el tipo de relación, el total de mis honorarios de proyectos y el próximo paso.",
        "- **Contactos** son las personas de esos clientes.",
        "- **Consultas** son posibles proyectos, desde el primer mensaje hasta la decisión del cliente. El valor es mi estimación del proyecto; el valor ponderado es esa estimación multiplicada por la probabilidad de la etapa.",
        "- **Proyectos** son el trabajo que he acordado. Los honorarios se calculan a partir de la tarifa diaria y el número de días. El estado Facturado es solo una etiqueta: la facturación se queda en mi herramienta de facturación.",
        "- **Tareas** son cosas que he prometido hacer, con fecha de vencimiento. Las tareas, los próximos pasos y sus fechas son campos normales: nadie recibe avisos automáticos, así que reviso la vista Próximos pasos cada mañana y Mate escribe un plan los lunes.",
        "- Una conversación de correo, WhatsApp o LinkedIn pertenece a un cliente o a una consulta solo cuando yo la vinculo ahí.",
        "",
        "## Qué se queda fuera",
        "- La facturación y la contabilidad se quedan en las herramientas que ya uso. Este espacio de trabajo guarda las relaciones con los clientes, las consultas abiertas y el trabajo en curso.",
        "- Los briefings de los clientes están en el campo Briefing de la consulta, y las propuestas y los documentos del proyecto, en los Archivos del proyecto, para que la búsqueda y Mate los encuentren por su texto. El Calendario de proyectos muestra cada proyecto desde el inicio hasta la entrega.",
      ],
    },
    stages: {
      title: "Etapas de una consulta",
      markdown: [
        "Todas las consultas pasan por las mismas etapas, para que el tablero muestre de un vistazo en qué punto está cada posible proyecto. El trabajo ganado continúa como proyecto.",
        "",
        "## Etapas",
        "1. **Consulta:** alguien pregunta por un proyecto. Añade el cliente, la persona y un valor aproximado.",
        "2. **Primera llamada:** hemos hablado de objetivos, plazos y de quién decide.",
        "3. **Propuesta enviada:** el alcance y mi estimación salieron por correo.",
        "4. **Ganada:** el cliente dijo que sí. Crea el proyecto con tarifa diaria, días, inicio y entrega, vinculado al cliente y a la consulta.",
        "5. **Perdida:** el cliente decidió que no o dejó de responder. Anota el motivo en las notas.",
      ],
    },
    afterCall: {
      title: "Después de una primera llamada",
      whenToUse: "Cuando ya ha tenido lugar la primera llamada o reunión sobre un proyecto nuevo.",
      markdown: [
        "Una primera llamada deja notas, una estimación más ajustada y la promesa de volver a escribir. Estos pasos mantienen todo eso en la consulta.",
        "",
        "## Pasos",
        "1. Escribe los objetivos, los plazos y las dudas pendientes en las notas de la consulta.",
        "2. Pasa la consulta a Primera llamada y actualiza el valor estimado.",
        "3. Anota el próximo paso y su fecha en la consulta y en el cliente.",
        "4. Vincula a la consulta la conversación de correo, WhatsApp o LinkedIn con el cliente.",
      ],
    },
    rates: {
      title: "Mis tarifas y condiciones",
      markdown: [
        "Estas son las tarifas y condiciones que presupuesto, para que cada propuesta y cada proyecto de este espacio de trabajo usen los mismos números.",
        "",
        "## Tarifas diarias",
        "- Diseño de producto y sistemas de diseño: 950 € al día.",
        "- Investigación de usuarios y talleres: 900 € al día.",
        "- Revisiones y auditorías UX: 850 € al día.",
        "",
        "## Condiciones",
        "- Presupuesto un número de días por proyecto; los honorarios del proyecto son la tarifa diaria por los días.",
        "- Los clientes existentes con más de 20 días al año tienen un 5 % de descuento sobre la tarifa diaria.",
        "- La mitad de los honorarios se paga al inicio y el resto en la entrega. La facturación se hace en mi herramienta de facturación, no aquí.",
      ],
    },
  },
  threads: {
    tidewaterProposal: {
      subject: "Rediseño del dashboard – propuesta de la fase 2",
      messages: [
        "Hola Max,\n\nGracias por enviarnos la propuesta de la fase 2. Javier y yo la leímos ayer. ¿Podemos repasar juntos la parte de investigación? No estamos seguros de necesitar otra vez cinco entrevistas.\n\nUn saludo,\nCarmen",
        "Hola Carmen,\n\nEncantado. El jueves a las 10 me va bien. Puedo enseñarte dónde bastarían tres entrevistas y qué perderíamos.\n\nUn saludo,\nMax",
        "El jueves a las 10, entonces. Llevaré a Javier.",
      ],
    },
    brightpathKickoff: {
      messages: [
        "¡Hola Max! Rubén y yo tenemos libre el martes por la mañana para el arranque. ¿Te va bien a las 9:30?",
        "Hola Marta, a las 9:30 me va bien. Te mando la agenda el viernes.",
        "Perfecto. ¿Podemos mirar también los resultados de la encuesta de onboarding anterior? Los ha encontrado Rubén.",
      ],
    },
    fernhillInquiry: {
      subject: "Consulta: UX para nuestro comparador de tarifas",
      messages: [
        "Hola Max,\n\nHemos encontrado tu portfolio a través de una compañera de Alondra Seguros. Muchos visitantes abandonan nuestra página del comparador de tarifas en el segundo paso y nos gustaría tener una mirada externa y un rediseño.\n\n¿Tendrías hueco en los próximos dos meses?\n\nUn saludo,\nDiego Lozano\nColina Verde Energía",
        "Hola Diego,\n\nGracias por escribirme. Sí, puedo empezar en la segunda quincena del mes que viene. Antes de proponer un alcance, ¿podrías enviarme la página actual y las cifras de abandono por paso?\n\nUn saludo,\nMax Bergmann",
      ],
    },
    meadowQuestions: {
      subject: "Propuesta del formulario de siniestros – preguntas",
      messages: [
        "Hola Max,\n\nNuestro equipo jurídico quiere revisar el nuevo formulario de siniestros antes de que salga en producción. ¿Podrías prever una ronda de revisión con ellos en la segunda semana?\n\nGracias,\nRaquel",
        "Hola Raquel,\n\nClaro. Añadiré una ronda de revisión con el equipo jurídico en la semana dos y pasaré el test de usabilidad a la semana tres. La propuesta actualizada te llega mañana.\n\nUn saludo,\nMax",
      ],
    },
    corvidCheckIn: {
      subject: "Dashboard de despacho – primeras pantallas",
      messages: [
        "Hola José,\n\nLas primeras pantallas de despacho están listas. ¿Podéis Cristian y tú echarles un vistazo antes del jueves? Me gustaría tener vuestra opinión sobre la vista de mapa antes de seguir.\n\nUn saludo,\nMax",
        "Hola Max,\n\nGracias, tienen muy buena pinta. Cristian está de viaje hasta el miércoles, así que nuestro feedback llegará el jueves.\n\nPablo",
      ],
    },
    quillScope: {
      subject: "Prototipo de onboarding – siguiente paso",
      messages: [
        "Hola Max,\n\nMuy buena la conversación de la semana pasada. Antes de comprometernos, nos gustaría acordar el alcance: ¿solo el registro o también la primera conexión bancaria?\n\nNuria",
        "Hola Nuria,\n\nYo abordaría el registro y la primera conexión bancaria juntos, porque la mayoría de la gente abandona justo entre los dos pasos. ¿Lo cerramos en una llamada corta el lunes?\n\nUn saludo,\nMax",
      ],
    },
  },
  inbox: {
    jennaReturn: {
      messages: [
        "Hola Irene, espero que la ronda de presupuestos haya ido bien. Si vuelve a salir la app de pasajeros, estaré encantado de ayudar, también con un alcance menor.",
        "Hola Max, qué casualidad. Salió, pero con más o menos la mitad de lo que hablamos el mes pasado. ¿Te valdría un alcance menor?",
        "Sí. Empezaría por el flujo de reserva y dejaría el resto para una segunda ronda. ¿En qué rango os movéis?",
        "En torno a 9.000 €. ¿Podemos hablar el jueves? Llevaría a nuestra diseñadora de producto para que os conozcáis.",
      ],
    },
    kevinAccessibility: {
      messages: [
        "Hola Max, Raquel me comentó tu revisión de accesibilidad del área de clientes. ¿Podrías enviarme el resumen corto?",
        "Hola Álvaro, claro. Mañana te mando el resumen de una página: cinco correcciones ya implantadas y dos todavía abiertas.",
        "Genial, gracias. Me gustaría enseñárselo al equipo jurídico antes de la revisión del formulario. ¿Podrías unirte a esa ronda en la semana dos?",
      ],
    },
    ninaCall: {
      messages: [
        "Hola Max, gracias por el correo tan claro. El lunes me va bien para la llamada. ¿Podría unirse nuestro CTO en la segunda mitad?",
        "Por supuesto, Nuria. La segunda mitad trata de la conexión bancaria, así que su opinión ayudará. Te envío una invitación para las 11:00.",
        "Genial. Te aviso: es escéptico con los prototipos.",
        "Mejor, los escépticos son los que mejor prueban. Llevaré una versión clicable de la parte del registro.",
      ],
    },
    tomScope: {
      messages: [
        "Hola Max, ¿cómo va la revisión de la app móvil? Marta pregunta por los plazos.",
        "Hola Rubén, esta semana te escribo dos opciones: 3 días para los flujos principales o 5 días con tests de usuarios.",
        "¡Genial! ¿Cuál elegirías?",
        "Sinceramente, la de 5 días. Los tests con docentes reales enseñan más que una revisión sola.",
        "Tiene sentido. ¿Más o menos cuánto cuesta cada una? Marta quiere una cifra antes del jueves.",
      ],
    },
    alexNumbers: {
      messages: [
        "Hola Alex, para la renovación del planificador me gustaría ver primero el uso actual. ¿Me puedes enviar las cifras de abandono por paso?",
        "Claro, las estoy sacando ahora.",
        "El 62 % empieza un plan en el móvil y solo el 21 % lo termina. El mayor abandono está en el selector de fecha del paso 2.",
        "Gracias, Alex, me ayuda mucho. Un selector de fecha que hace perder a la gente suele ser fácil de arreglar. Te mando antes del viernes un plan corto con mejoras y un precio.",
      ],
    },
    danJobList: {
      messages: [
        "Max, Cristian vuelve el miércoles. ¿Te va bien el jueves a las 11 para la llamada de feedback?",
        "El jueves a las 11 me va bien. Enseñaré la vista de mapa y la nueva lista de trabajos.",
        "Genial. Una petición: ¿podría la lista de trabajos mostrar la siguiente parada del conductor?",
        "Sí, ya está en mi lista. Nos vemos el jueves.",
      ],
    },
    lauraReferral: {
      messages: [
        "Hola Max, le he pasado tus datos a Diego Lozano, de Colina Verde Energía. Necesita ayuda de UX con su comparador de tarifas. ¡Espero que te parezca bien!",
        "Hola Raquel, ¡más que bien, muchas gracias! Estaré atento a su correo.",
        "Es simpático, pero va con prisa :)",
        "Anotado :) Y esta semana te mando la novedad de la propuesta del formulario de siniestros.",
      ],
    },
    chrisShiftView: {
      subject: "Vista de turnos: feedback",
      messages: [
        "Hola Cristian,\n\nHe añadido la vista de turnos a las pantallas de despacho. Cuando vuelvas, ¿puedes decirme si la vista semanal funciona para vuestro equipo de despacho?\n\nUn saludo,\nMax",
        "Hola Max,\n\nHe vuelto antes de lo previsto, así que te mando mi feedback antes del jueves. La vista semanal es clara. Dos cosas: las dobles reservas deberían verse en rojo y los filtros deberían mantenerse al cambiar de día. Es lo que más molesta al equipo de despacho.\n\n¿Puedes decirme antes del viernes qué cabe en el alcance actual?\n\nCristian",
        "Hola Cristian,\n\nGracias, me viene muy bien. Las dos cosas caben en el alcance actual: las dobles reservas en rojo son rápidas y mantendré los filtros al cambiar de día. El lunes te mando las pantallas actualizadas.\n\nUn saludo,\nMax",
      ],
    },
    marcusDatePickers: {
      subject: "Auditoría del sistema de diseño: selectores de fecha",
      messages: [
        "Hola Max,\n\nHe leído tus conclusiones. ¿Cuál de los tres selectores de fecha mantendrías? Preferimos unificarlos en un solo sprint antes que repartirlo en tres.\n\nJavier",
        "Hola Javier,\n\nMantendría el de los filtros de informes. Tiene el mejor soporte de teclado y la selección de rango más clara. Antes del viernes añadiré a las conclusiones una recomendación breve con capturas.\n\nUn saludo,\nMax",
        "Hola Max,\n\nMe parece bien. ¿Podrías también listar qué pantallas usan qué selector? Así puedo dimensionar el trabajo.\n\nJavier",
        "Hola Javier,\n\nClaro. La tabla con los nombres de las pantallas irá en el informe.\n\nUn saludo,\nMax",
      ],
    },
    rachelKickoff: {
      subject: "Taller de arranque: agenda y horarios de las entrevistas",
      messages: [
        "Hola Marta,\n\nAquí tienes la agenda del arranque del martes: 9:30 objetivos y medidas de éxito, 10:30 la encuesta de onboarding anterior, 11:30 plan de las cuatro entrevistas con docentes. Dime si debería unirse alguien más.\n\nUn saludo,\nMax",
        "Hola Max,\n\nMe parece bien. ¿Podemos empezar por los resultados de la encuesta? Rubén ha encontrado más datos. Y ¿podemos mantener las entrevistas a partir de las 15:00? Es cuando los docentes están libres.\n\nMarta",
        "Hola Marta,\n\nClaro, primero la encuesta. Las entrevistas son todas entre las 15:00 y las 16:30, de lunes a jueves, como en el plan.\n\nUn saludo,\nMax",
        "Perfecto. Rubén traerá la exportación de la encuesta el martes. ¿Puedes enviarnos antes la guía de entrevistas para que le echemos un vistazo?\n\nMarta",
      ],
    },
    priyaTestimonial: {
      subject: "Una frase corta para mi web",
      messages: [
        "Hola Carmen,\n\n¿Te parecería bien que usara un testimonio corto tuyo en mi web? Con dos o tres frases basta.\n\nUn saludo,\nMax",
        "Hola Max,\n\nClaro. ¿Qué te parece esto?: «Max consiguió que nuestro dashboard resultara comprensible incluso para quienes nunca soportaron la analítica. Hizo él mismo la investigación y, con el rediseño, nuestras consultas a soporte se redujeron a la mitad». Acórtalo si quieres.\n\nCarmen",
        "Hola Carmen,\n\nMuchas gracias, es genial. Lo usaré tal cual y te enviaré la página antes de publicarla.\n\nUn saludo,\nMax",
      ],
    },
  },
  notes: {
    deals: {
      tidewaterDashboard:
        "Resumen de Claude tras la llamada del martes:\n- Carmen y Javier leyeron la propuesta y están de acuerdo con el precio.\n- Quieren tres entrevistas en lugar de cinco: la investigación baja a 3 días (2.700 €) y el total a 13 días (12.200 €).\n- Javier necesita una estimación de ingeniería de su equipo antes de dar el visto bueno.\n- Próximo paso: repasar juntos la investigación y el diseño el jueves a las 10.",
      fernhillTariff:
        "Borrador de ChatGPT a partir del briefing del cliente:\n- Problema: solo el 38 % continúa en el paso 2 (consumo anual) y 7.400 visitantes llegan hasta ahí.\n- Plan aproximado: 2 días de investigación con cuatro entrevistas (1.800 €) y 4 días de diseño (3.800 €), 5.600 € en total, dentro del presupuesto de Diego, de unos 6.000 €.\n- Preguntas abiertas: acceso a la página actual y a sus analíticas, y quién construirá el resultado.",
    },
    organizations: {
      atlas:
        "Limpiado por Codex (script ejecutado sobre la exportación CSV de mi antigua hoja de clientes):\n- Añadidos el sitio web y la dirección de Málaga de la fila 14.\n- Vinculada Irene Gil y eliminada una fila de contacto duplicada.\n- No se modificó ningún otro registro.",
    },
    tasks: {
      replySam:
        "Tarea creada por Claude a partir del correo de Diego:\n- Diego Lozano pregunta si tengo hueco en los próximos dos meses para la página del comparador de tarifas.\n- Posibles inicios: el lunes después de la entrega de Cuervo (dos días a la semana) o el lunes después de entregar la auditoría de Marea (tres días a la semana).\n- La respuesta del hilo es un borrador; no se ha enviado nada.",
    },
  },
  agents: {
    company: "Robledal Diseño de Producto",
    records: "clientes, consultas y proyectos",
    mate: "Responde preguntas sobre mi semana, convierte un briefing en una consulta, crea tareas a partir de correos y guarda borradores de respuesta cuando se lo pido.",
    claude:
      "Escribe el resumen de una llamada en las notas de la consulta y esboza una primera propuesta a partir de mis tarifas y condiciones.",
    chatgpt:
      "Lee el briefing de un cliente y esboza el alcance con días y honorarios, que reviso antes de que salga nada.",
    codex:
      "Ejecuta scripts sobre mis datos: importar mi antigua hoja de clientes, unir contactos duplicados y exportar los honorarios de los proyectos para mi contabilidad.",
    followUp:
      "La rutina «Cada mañana, borradores de seguimiento de las consultas que vencen hoy» se ejecuta por las mañanas de lunes a viernes a las 8:00. Lee las consultas cuya fecha del próximo paso es hoy o anterior y guarda un borrador de seguimiento breve cuando el contacto tiene dirección de correo. Los borradores esperan en la bandeja de entrada a que yo los revise; la rutina nunca envía nada y no cambia ninguna etapa ni fecha.",
  },
  mateRecords: {
    title: "Proyecto tras el sí de Senda",
    question:
      "Marta ha confirmado el flujo de onboarding. Pasa la consulta a Ganada y crea el proyecto: 11 días a 900 €, inicio en dos días, entrega en unas siete semanas.",
    answer:
      "Hecho.\n\n- **Consulta:** el onboarding para docentes de Senda ha pasado de Propuesta enviada a **Ganada**.\n- **Proyecto:** he creado el onboarding para docentes de Senda Educativa, vinculado a la consulta. 11 días a 900 € dan unos honorarios de **9.900 €**; empieza en dos días y la entrega es dentro de siete semanas.\n- **Cliente:** Senda Educativa sigue en *Continua* y he puesto como próximo paso «Taller de arranque para el flujo de onboarding».\n\nLos honorarios se calculan a partir de la tarifa diaria y los días, así que solo introduje esos dos datos. No he escrito a Marta; si quieres una nota de agradecimiento, dímelo y la guardaré como borrador.",
  },
};
