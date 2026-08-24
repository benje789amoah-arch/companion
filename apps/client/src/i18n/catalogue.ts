/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Locale } from './locales';

/**
 * What FreshFold *sells*, in the customer's language.
 *
 * Deliberately separate from the `en`/`es`/`fr` dictionaries next door, and
 * built the opposite way round. Those hold the app's own copy — buttons,
 * labels, error sentences — with English as a full dictionary that defines
 * `TranslationKey`. This holds the catalogue: service descriptions, plan
 * benefits, testimonials. **There is no English map here.** The English is the
 * literal already sitting in `src/data/catalogue.ts` and
 * `packages/core/src/services.ts`, and it is passed in as the fallback.
 *
 * That asymmetry is the point. Duplicating a hundred and thirty English strings
 * into a dictionary would create two copies of every service description, and
 * the copy nobody renders is the copy that goes stale — a price note edited in
 * the catalogue and not here would show the old wording to English readers and
 * nobody would find out. Here, editing the data *is* editing the English, and a
 * Spanish entry that has drifted is a translation problem rather than a
 * correctness one.
 *
 * **What is not translated, and why:**
 *
 * - **Service names.** `'Washing (Machine & Hand Wash)'` is the wire value a
 *   booking stores in `serviceType`, matched by `serviceByName` on the server
 *   and printed on the courier's job card. Translating it would mean a Spanish
 *   customer's booking naming a service the server cannot price. The
 *   *description* beneath it carries the meaning and is translated; the name is
 *   an identifier that happens to read as English.
 * - **Testimonial names.** Seraphina Kensington is called that in every
 *   language. Their *roles* and what they said are copy and are translated.
 * - **Plan names.** `Student Club Plan` and the rest are the commercial terms
 *   in `MEMBERSHIP_PLANS`, quoted back in receipts and on the server's
 *   membership records. Their taglines and benefits are translated.
 * - **Numbers and units inside copy.** `20 lbs / month` keeps its figure; only
 *   the words around it move.
 *
 * Keys are `<group>.<id>.<field>`, with the id taken from the record itself so
 * a service renamed in the catalogue does not silently lose its translation.
 */

/* eslint-disable @typescript-eslint/naming-convention */

const es: Record<string, string> = {
  // ------------------------------------------------------------- services
  'service.washing.desc':
    'Tratamientos a mano a medida para sedas finas y cachemira, junto con lavado en tambor a temperatura regulada para prendas de diseño.',
  'service.washing.short': 'Lavado y cuidado',

  'service.drying.desc':
    'Deshidratación controlada a baja temperatura que evita el encogimiento térmico y devuelve el cuerpo original del tejido y la elasticidad de la lana.',
  'service.drying.short': 'Secado al aire',
  'service.drying.note': 'Incluido con el lavado',

  'service.ironing-folding.desc':
    'Acabados al vapor planchados a mano y doblado de boutique con raya perfecta, listos para el armario.',
  'service.ironing-folding.short': 'Planchado y doblado',

  'service.stain-removal.desc':
    'Tratamiento enzimático ecológico y localizado que libera con seguridad las manchas de vino tinto, aceite y café.',
  'service.stain-removal.short': 'Manchas',

  'service.bedding-linens.desc':
    'Ciclos higienizantes de agua caliente combinados con fórmulas orgánicas de extracto floral, ultrasuaves, para sábanas de alta densidad de hilo.',
  'service.bedding-linens.short': 'Ropa de cama',

  'service.express-laundry.desc':
    'Una secuencia acelerada y dedicada. Recogido en su casa antes de las 9:00, entregado recién planchado a las 19:30.',
  'service.express-laundry.short': 'En el día',

  'service.pickup-delivery.desc':
    'Cómodo, fiable y puntual, siempre. Logística con seguimiento GPS en tiempo real que garantiza que sus pedidos se recogen y se devuelven exactamente a su hora.',
  'service.pickup-delivery.short': 'Sólo recogida',
  'service.pickup-delivery.note': 'Gratuito',

  'service.car-detailing.desc':
    'Restauramos, damos brillo y protegemos su vehículo. Vapor a mano de alta gama, sellado con cera de polímero y detallado profundo por dentro y por fuera.',
  'service.car-detailing.short': 'Detallado de coche',

  'service.home-office-cleaning.desc':
    'Espacios impecables y una vida más sana. Higienización de superficies con vapor profundo, eliminación precisa del polvo y desodorización natural libre de alérgenos.',
  'service.home-office-cleaning.short': 'Limpieza a fondo',

  'service.sofa-carpet-cleaning.desc':
    'Limpieza profunda para un hogar más fresco y seguro. Extracción con agua caliente de alta potencia, neutralización de manchas y protectores antibacterianos para toda la tapicería.',
  'service.sofa-carpet-cleaning.short': 'Tapicería',

  'service.corporate.desc':
    'Logística continua y protocolos de cuidado a medida para hoteles boutique, spas de alta gama, estudios de fitness exclusivos y oficinas corporativas.',
  'service.corporate.short': 'Empresas',
  'service.corporate.note': 'Presupuestos a medida',

  // ----------------------------------------------------------- categories
  'category.core.label': 'Cuidado diario',
  'category.core.blurb': 'Lo esencial de cada semana, bien hecho.',
  'category.specialized.label': 'Especializado',
  'category.specialized.blurb': 'Tejidos y espacios que piden una mano concreta.',
  'category.express.label': 'Exprés',
  'category.express.blurb': 'Cuando tiene que estar de vuelta hoy.',

  // ---------------------------------------------------------------- plans
  'plan.student.tagline': 'Cuidado textil sin preocupaciones, pensado para el horario de clases.',
  'plan.student.capacity': '9 kg / mes de colada',
  'plan.student.turnaround': 'Entrega al día siguiente por norma',
  'plan.student.benefit.0': '2 recogidas programadas al mes, colada incluida',
  'plan.student.benefit.1': 'Jabón orgánico hipoalergénico gratuito',
  'plan.student.benefit.2': 'Tarifa de socio del 10% una vez usadas las dos',
  'plan.student.benefit.3': 'Historial digital de la colada',

  'plan.professional.tagline':
    'Camisas de vestir, conjuntos de trabajo y trajes siempre impecables.',
  'plan.professional.capacity': '20 kg / mes + 10 prendas planchadas',
  'plan.professional.turnaround': 'Entrega al día siguiente por norma',
  'plan.professional.benefit.0': 'Recogidas semanales en la puerta — 4 al mes, colada incluida',
  'plan.professional.benefit.1': 'Lavado a mano delicado gratuito para punto a medida',
  'plan.professional.benefit.2': 'Entrega en percha de boutique con funda protectora',
  'plan.professional.benefit.3': 'Tarifa de socio del 15% más allá de las cuatro',

  'plan.family.tagline': 'Grandes volúmenes con separación prenda a prenda.',
  'plan.family.capacity': '45 kg / mes de ciclos intensivos',
  'plan.family.turnaround': 'Entrega estándar en 24 horas',
  'plan.family.benefit.0': '8 recogidas al mes (dos por semana), colada incluida',
  'plan.family.benefit.1': 'Reglas estrictas de separación por tejido y por hogar',
  'plan.family.benefit.2': 'Lavado y planchado de edredones y sábanas sin coste',
  'plan.family.benefit.3': 'Tarifa de socio del 20% más allá de las ocho',

  'plan.corporate.tagline': 'Cuidado a medida y de alta frecuencia para empresas exigentes.',
  'plan.corporate.capacity': '90 kg / mes + configuraciones a medida',
  'plan.corporate.turnaround': 'Entrega el mismo día, con prioridad',
  'plan.corporate.benefit.0': 'Recogidas diarias — 30 al mes, colada incluida',
  'plan.corporate.benefit.1': 'Informes de control de calidad de guante blanco',
  'plan.corporate.benefit.2':
    'Gestor de cuenta dedicado y restauración exprés de manchas',
  'plan.corporate.benefit.3': 'Tarifa de socio del 25% más allá de las treinta',

  // ---------------------------------------------------------------- tiers
  'tier.basic.desc': 'Nuestro nivel de entrada. Gane 1 punto por cada ₵1 gastado.',
  'tier.basic.benefit.0': 'Seguimiento GPS del mensajero en directo',
  'tier.basic.benefit.1': 'Historial digital de toda su colada',
  'tier.basic.benefit.2': 'Programación a cualquier hora, todos los días',

  'tier.silver.desc':
    'Seguimiento de prendas de nivel superior. Se alcanza a los 500 puntos acumulados.',
  'tier.silver.benefit.0': '10% de descuento directo en todo el tratamiento especializado de manchas',
  'tier.silver.benefit.1': 'Recogida matinal prioritaria de urgencia',
  'tier.silver.benefit.2': 'Lavados de acondicionamiento de temporada gratuitos',
  'tier.silver.benefit.3': 'Línea VIP de atención al cliente dedicada',

  'tier.gold.desc':
    'La máxima hospitalidad textil a medida. Se alcanza a los 1500 puntos acumulados.',
  'tier.gold.benefit.0': '20% de descuento permanente en todos los ciclos de lavado y planchado',
  'tier.gold.benefit.1': 'Devolución exprés el mismo día garantizada (recargo siempre exento)',
  'tier.gold.benefit.2': 'Contacto directo con un maestro artesano certificado',
  'tier.gold.benefit.3': 'Aroma personalizado a medida (eucalipto, lavanda o sin perfume)',

  // --------------------------------------------------------- testimonials
  'testimonial.0.role': 'Directora creativa y consultora de moda',
  'testimonial.0.quote':
    'Con lo exigente que soy con los tejidos, confiar mi punto a medida me daba verdadera angustia. FreshFold trata mis prendas como obras de arte, una por una.',
  'testimonial.1.role': 'Socio director en Reynolds Asset Management',
  'testimonial.1.quote':
    'El plan Professional cambió mi forma de viajar. Bajo del avión, programo una entrega en el casillero y por la mañana mi ropa de trabajo está de vuelta en el armario.',
  'testimonial.2.role': 'Hotelera de lujo y defensora de las familias',
  'testimonial.2.quote':
    'Lavar la ropa de cama de un establecimiento siempre lleno nos descuadraba el horario. FreshFold higieniza nuestros algodones italianos con aromas naturales. Un cuidado perfecto.',

  // ------------------------------------------------------------ how it works
  'step.schedule.title': 'Reserve',
  'step.schedule.body':
    'Elija un servicio, una franja y una dirección. El precio se cierra antes de que se comprometa.',
  'step.collect.title': 'Recogemos',
  'step.collect.body':
    'Un mensajero llega en su franja, escanea cada bolsa en el listado y sale hacia el taller.',
  'step.care.title': 'Cuidado artesanal',
  'step.care.body':
    'Clasificado, tratado, lavado a la temperatura que pide cada tejido y planchado a mano.',
  'step.return.title': 'Devuelto',
  'step.return.body':
    'De vuelta en su puerta, doblado o en percha, con prueba de entrega en la app.',

  // -------------------------------------------------------------- why us
  'why.tracking.title': 'Véalo suceder',
  'why.tracking.body':
    'La posición real del mensajero, la fase en la que están sus prendas y el minuto exacto de llegada.',
  'why.fabric.title': 'El tejido primero',
  'why.fabric.body':
    'Temperatura, agitación y acabado elegidos por prenda, no por colada.',
  'why.eco.title': 'Química suave',
  'why.eco.body':
    'Tratamiento enzimático de manchas y detergentes de origen vegetal. Hipoalergénico si lo pide.',
  'why.guarantee.title': 'Garantía de cuidado',
  'why.guarantee.body':
    'Todo lo que no quede bien se vuelve a tratar por nuestra cuenta. Avísenos desde la pantalla del pedido.',

  // ------------------------------------------------------------ segments
  'segment.students.title': 'Estudiantes',
  'segment.students.body':
    'Recogidas en residencias de Ayeduase, Kotei y los colegios mayores del campus, a precio de presupuesto estudiantil.',
  'segment.executives.title': 'Directivos',
  'segment.executives.body':
    'Camisas planchadas a un nivel con el que entrar a un consejo, de vuelta por la mañana.',
  'segment.homes.title': 'Hogares y familias',
  'segment.homes.body':
    'Ciclos de gran volumen con separación por hogar, además de ropa de cama, tapicería y limpiezas a fondo.',
  'segment.business.title': 'Hoteles y spas',
  'segment.business.body':
    'Volúmenes por contrato con gestor de cuenta asignado e informes de control de calidad.',

  // ------------------------------------------------------- payment methods
  'pay.Paystack.label': 'Pago con Paystack',
  'pay.Paystack.blurb': 'Tarjeta, banco o dinero móvil en la página segura.',
  'pay.Wallet.label': 'Cartera FreshFold',
  'pay.Wallet.blurb': 'Liquide al instante con su saldo guardado.',
  'pay.Pay on Pickup.label': 'Pago en la recogida',
  'pay.Pay on Pickup.blurb': 'Liquide con el mensajero en la puerta.',
};

const fr: Record<string, string> = {
  // ------------------------------------------------------------- services
  'service.washing.desc':
    'Soins à la main sur mesure pour les soies fines et le cachemire, avec un lavage en tambour à température régulée pour les pièces de créateur.',
  'service.washing.short': 'Lavage et soin',

  'service.drying.desc':
    'Déshydratation contrôlée à basse température qui évite le rétrécissement thermique et rend au tissu son gonflant et à la laine son élasticité.',
  'service.drying.short': 'Séchage à l’air',
  'service.drying.note': 'Compris avec le lavage',

  'service.ironing-folding.desc':
    'Finitions vapeur repassées à la main et pliage soigné au pli net, prêt à ranger dans le placard.',
  'service.ironing-folding.short': 'Repassage et pliage',

  'service.stain-removal.desc':
    'Traitement enzymatique écologique et ciblé qui libère sans risque les taches de vin rouge, d’huile et de café.',
  'service.stain-removal.short': 'Taches',

  'service.bedding-linens.desc':
    'Cycles assainissants à l’eau chaude associés à des formules bio ultra-douces aux extraits floraux, pour les draps à haute densité de fils.',
  'service.bedding-linens.short': 'Linge de lit',

  'service.express-laundry.desc':
    'Une séquence accélérée et dédiée. Collecté chez vous avant 9 h, livré fraîchement repassé à 19 h 30.',
  'service.express-laundry.short': 'Le jour même',

  'service.pickup-delivery.desc':
    'Pratique, fiable, à l’heure, à chaque fois. Une logistique suivie par GPS en temps réel qui garantit que vos commandes partent et reviennent à votre heure exacte.',
  'service.pickup-delivery.short': 'Collecte seule',
  'service.pickup-delivery.note': 'Offert',

  'service.car-detailing.desc':
    'Nous restaurons, faisons briller et protégeons votre véhicule. Vapeur à la main haut de gamme, scellant polymère et détaillage complet intérieur et extérieur.',
  'service.car-detailing.short': 'Détaillage auto',

  'service.home-office-cleaning.desc':
    'Des espaces impeccables et une vie plus saine. Assainissement des surfaces à la vapeur, dépoussiérage précis et désodorisation naturelle sans allergènes.',
  'service.home-office-cleaning.short': 'Nettoyage à fond',

  'service.sofa-carpet-cleaning.desc':
    'Nettoyage en profondeur pour une maison plus fraîche et plus saine. Extraction à l’eau chaude, neutralisation des taches et protecteurs antibactériens pour tous les tissus.',
  'service.sofa-carpet-cleaning.short': 'Tissus d’ameublement',

  'service.corporate.desc':
    'Logistique continue et protocoles de soin sur mesure pour les hôtels de charme, les spas haut de gamme, les studios de sport exclusifs et les bureaux.',
  'service.corporate.short': 'Entreprises',
  'service.corporate.note': 'Devis sur mesure',

  // ----------------------------------------------------------- categories
  'category.core.label': 'Soin du quotidien',
  'category.core.blurb': 'L’essentiel de la semaine, fait correctement.',
  'category.specialized.label': 'Spécialisé',
  'category.specialized.blurb': 'Les tissus et les espaces qui demandent une main précise.',
  'category.express.label': 'Express',
  'category.express.blurb': 'Quand cela doit revenir aujourd’hui.',

  // ---------------------------------------------------------------- plans
  'plan.student.tagline': 'Un linge sans souci, pensé pour l’emploi du temps des cours.',
  'plan.student.capacity': '9 kg / mois de linge',
  'plan.student.turnaround': 'Retour le lendemain par défaut',
  'plan.student.benefit.0': '2 collectes programmées par mois, lavage compris',
  'plan.student.benefit.1': 'Lessive bio hypoallergénique offerte',
  'plan.student.benefit.2': 'Tarif adhérent de 10 % une fois les deux utilisées',
  'plan.student.benefit.3': 'Historique numérique du linge',

  'plan.professional.tagline':
    'Chemises de ville, tenues de travail et costumes toujours impeccables.',
  'plan.professional.capacity': '20 kg / mois + 10 pièces repassées',
  'plan.professional.turnaround': 'Retour le lendemain par défaut',
  'plan.professional.benefit.0': 'Collectes hebdomadaires à la porte — 4 par mois, lavage compris',
  'plan.professional.benefit.1': 'Lavage main délicat offert pour les mailles sur mesure',
  'plan.professional.benefit.2': 'Retour sur cintre avec housse de protection',
  'plan.professional.benefit.3': 'Tarif adhérent de 15 % au-delà des quatre',

  'plan.family.tagline': 'Gros volumes, avec une séparation pièce par pièce.',
  'plan.family.capacity': '45 kg / mois de cycles intensifs',
  'plan.family.turnaround': 'Livraison standard sous 24 heures',
  'plan.family.benefit.0': '8 collectes par mois (deux par semaine), lavage compris',
  'plan.family.benefit.1': 'Règles strictes de séparation par tissu et par foyer',
  'plan.family.benefit.2': 'Lavage et repassage des couettes et des draps offerts',
  'plan.family.benefit.3': 'Tarif adhérent de 20 % au-delà des huit',

  'plan.corporate.tagline': 'Un soin sur mesure et à haute fréquence pour les entreprises exigeantes.',
  'plan.corporate.capacity': '90 kg / mois + configurations sur mesure',
  'plan.corporate.turnaround': 'Retour le jour même, en priorité',
  'plan.corporate.benefit.0': 'Collectes quotidiennes — 30 par mois, lavage compris',
  'plan.corporate.benefit.1': 'Rapports d’assurance qualité au cordeau',
  'plan.corporate.benefit.2':
    'Gestionnaire de compte dédié et restauration express des taches',
  'plan.corporate.benefit.3': 'Tarif adhérent de 25 % au-delà des trente',

  // ---------------------------------------------------------------- tiers
  'tier.basic.desc': 'Notre niveau d’entrée. Gagnez 1 point par ₵1 dépensé.',
  'tier.basic.benefit.0': 'Suivi GPS du coursier en direct',
  'tier.basic.benefit.1': 'Historique numérique de tout votre linge',
  'tier.basic.benefit.2': 'Programmation à toute heure, tous les jours',

  'tier.silver.desc':
    'Un suivi des pièces d’un cran au-dessus. Atteint à 500 points cumulés.',
  'tier.silver.benefit.0': '10 % de remise directe sur tout traitement spécialisé des taches',
  'tier.silver.benefit.1': 'Collecte matinale prioritaire en urgence',
  'tier.silver.benefit.2': 'Lavages d’entretien saisonniers offerts',
  'tier.silver.benefit.3': 'Ligne VIP dédiée au service client',

  'tier.gold.desc':
    'La plus haute hospitalité textile sur mesure. Atteint à 1500 points cumulés.',
  'tier.gold.benefit.0': '20 % de remise à vie sur tous les cycles de lavage et de repassage',
  'tier.gold.benefit.1': 'Retour express le jour même garanti (supplément toujours offert)',
  'tier.gold.benefit.2': 'Contact direct d’un maître artisan certifié',
  'tier.gold.benefit.3': 'Parfum personnalisé sur mesure (eucalyptus, lavande ou sans parfum)',

  // --------------------------------------------------------- testimonials
  'testimonial.0.role': 'Directrice de création et consultante mode',
  'testimonial.0.quote':
    'Exigeante comme je le suis sur les tissus, confier mes mailles sur mesure me nouait l’estomac. FreshFold traite mes pièces comme des œuvres, une par une.',
  'testimonial.1.role': 'Associé gérant chez Reynolds Asset Management',
  'testimonial.1.quote':
    'L’abonnement Professional a changé ma façon de voyager. Je descends d’avion, je programme un dépôt en casier, et le lendemain matin mes tenues de travail sont de retour dans mon placard.',
  'testimonial.2.role': 'Hôtelière de luxe et porte-parole des familles',
  'testimonial.2.quote':
    'Laver le linge de lit d’un établissement toujours complet désorganisait nos journées. FreshFold assainit nos cotons italiens avec des parfums naturels. Un soin parfait.',

  // ------------------------------------------------------------ how it works
  'step.schedule.title': 'Réservez',
  'step.schedule.body':
    'Choisissez un service, un créneau et une adresse. Le prix est fixé avant que vous vous engagiez.',
  'step.collect.title': 'Nous collectons',
  'step.collect.body':
    'Un coursier arrive dans votre créneau, scanne chaque sac sur la liste et repart vers l’atelier.',
  'step.care.title': 'Soin artisanal',
  'step.care.body':
    'Trié, traité, lavé à la température que demande chaque tissu, puis repassé à la main.',
  'step.return.title': 'Rendu',
  'step.return.body':
    'De retour à votre porte, plié ou sur cintre, avec la preuve de livraison dans l’application.',

  // -------------------------------------------------------------- why us
  'why.tracking.title': 'Voyez-le se faire',
  'why.tracking.body':
    'La position réelle du coursier, l’étape où en sont vos pièces, la minute exacte de l’arrivée.',
  'why.fabric.title': 'Le tissu d’abord',
  'why.fabric.body':
    'Température, agitation et finition choisies par pièce, et non par machine.',
  'why.eco.title': 'Chimie douce',
  'why.eco.body':
    'Traitement enzymatique des taches et lessives d’origine végétale. Hypoallergénique sur demande.',
  'why.guarantee.title': 'Garantie de soin',
  'why.guarantee.body':
    'Tout ce qui ne va pas est retraité à nos frais. Signalez-le depuis l’écran de la commande.',

  // ------------------------------------------------------------ segments
  'segment.students.title': 'Étudiants',
  'segment.students.body':
    'Collectes en résidence à Ayeduase, Kotei et dans les cités du campus, à un prix pensé pour un budget de semestre.',
  'segment.executives.title': 'Cadres',
  'segment.executives.body':
    'Des chemises repassées à un niveau que l’on porte en conseil d’administration, de retour au matin.',
  'segment.homes.title': 'Foyers et familles',
  'segment.homes.body':
    'Cycles en gros volume avec séparation par foyer, plus le linge de lit, les tissus d’ameublement et les nettoyages à fond.',
  'segment.business.title': 'Hôtels et spas',
  'segment.business.body':
    'Des volumes sous contrat avec un gestionnaire de compte attitré et des rapports d’assurance qualité.',

  // ------------------------------------------------------- payment methods
  'pay.Paystack.label': 'Paiement Paystack',
  'pay.Paystack.blurb': 'Carte, banque ou paiement mobile sur la page sécurisée.',
  'pay.Wallet.label': 'Portefeuille FreshFold',
  'pay.Wallet.blurb': 'Réglez à l’instant depuis votre solde.',
  'pay.Pay on Pickup.label': 'Paiement au retrait',
  'pay.Pay on Pickup.blurb': 'Réglez auprès du coursier, à la porte.',
};

const DICTIONARIES: Partial<Record<Locale, Record<string, string>>> = { es, fr };

/**
 * The catalogue string for this key in this language, or the English passed in.
 *
 * `english` is required rather than optional, and that is the whole design: the
 * caller always has the literal to hand — it is the field it was about to
 * render — so there is no path where a missing translation produces a raw key
 * on screen. Adding a service is one edit, in the data, and it reads in English
 * everywhere until somebody translates it.
 */
export function catalogueText(locale: Locale, key: string, english: string): string {
  return DICTIONARIES[locale]?.[key] || english;
}

/**
 * How much of the catalogue a language covers, as a fraction of the Spanish
 * key set.
 *
 * Spanish is the yardstick because there is no English map to count against —
 * see the note at the top. It makes the number a comparison between
 * translations rather than against a source, which is enough for what it is
 * for: telling `npm run i18n` whether a language has fallen behind.
 */
export function catalogueCoverage(locale: Locale): number {
  const reference = Object.keys(es);
  if (locale === 'en') return 1;

  const dictionary = DICTIONARIES[locale];
  if (!dictionary) return 0;

  return reference.filter((key) => !!dictionary[key]).length / reference.length;
}

/** Every catalogue key, for the coverage report. */
export const CATALOGUE_KEYS: string[] = Object.keys(es);
