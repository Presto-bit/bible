/** 发现 · 人生主题专题（§5.4.1） */

export interface LifeTopic {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  verses: { ref: string; text: string }[];
  microPlanId?: string;
  microPlanDays?: number;
  sensitive?: boolean;
}

export const LIFE_TOPICS: LifeTopic[] = [
  {
    id: 'hope',
    title: '盼望',
    subtitle: '在动荡中仰望神的应许',
    color: '#6b8f71',
    microPlanId: 'gospel_30',
    microPlanDays: 7,
    verses: [
      { ref: 'ROM.8.28', text: '我们晓得万事都互相效力，叫爱神的人得益处…' },
      { ref: 'JER.29.11', text: '耶和华说：我知道我向你们所怀的意念…' },
      { ref: 'HEB.11.1', text: '信就是所望之事的实底，是未见之事的确据。' },
    ],
  },
  {
    id: 'anxiety',
    title: '焦虑',
    subtitle: '把忧虑卸在神面前',
    color: '#7a8fa8',
    sensitive: true,
    microPlanId: 'prayer_peace_21',
    microPlanDays: 7,
    verses: [
      { ref: 'PHP.4.6', text: '应当一无挂虑，只要凡事借着祷告、祈求，和感谢，将你们所要的告诉神。' },
      { ref: 'MAT.6.34', text: '所以不要为明天忧虑…' },
      { ref: '1PE.5.7', text: '你们要将一切的忧虑卸给神，因为他顾念你们。' },
    ],
  },
  {
    id: 'prayer',
    title: '祷告',
    subtitle: '与父同行的生活节奏',
    color: '#8b7355',
    microPlanId: 'prayer_acts_30',
    microPlanDays: 7,
    verses: [
      { ref: 'MAT.6.9', text: '所以，你们祷告要这样说：我们在天上的父…' },
      { ref: 'LUK.18.1', text: '耶稣设一个比喻，是要人常常祷告，不可灰心。' },
      { ref: 'JAS.5.16', text: '义人祈祷所发的力量是大有功效的。' },
    ],
  },
  {
    id: 'family',
    title: '家庭',
    subtitle: '在关系中活出爱',
    color: '#a67c52',
    verses: [
      { ref: 'EPH.5.25', text: '你们作丈夫的，要爱你们的妻子…' },
      { ref: 'COL.3.13', text: '倘若这人与那人有嫌隙，总要彼此包容，彼此饶恕…' },
      { ref: 'PSA.127.1', text: '若不是耶和华建造房屋，建造的人就枉然劳力…' },
    ],
  },
  {
    id: 'work',
    title: '工作',
    subtitle: '在岗位上荣耀神',
    color: '#5c6b7a',
    verses: [
      { ref: 'COL.3.23', text: '你们作事，要仿佛为主而作，不是为人而作。' },
      { ref: 'PRO.16.3', text: '你所做的，要交托耶和华，你所谋的，就必成立。' },
      { ref: 'ECC.9.10', text: '凡你手所当做的，要尽力去做…' },
    ],
  },
  {
    id: 'grief',
    title: '悲伤',
    subtitle: '在眼泪中仍被拥抱',
    color: '#6d6d8a',
    sensitive: true,
    verses: [
      { ref: 'PSA.34.18', text: '耶和华靠近伤心的人，拯救心灵痛悔的人。' },
      { ref: 'REV.21.4', text: '神要擦去他们一切的眼泪…' },
      { ref: 'MAT.5.4', text: '哀恸的人有福了！因为他们必得安慰。' },
    ],
  },
  {
    id: 'faith',
    title: '信心',
    subtitle: '信靠 unseen 的恩典',
    color: '#5b6b4f',
    verses: [
      { ref: 'HEB.11.6', text: '人非有信，就不能得神的喜悦…' },
      { ref: 'MRK.9.24', text: '我信！求你帮助我的不信！' },
      { ref: 'ROM.10.17', text: '可见信道是从听道来的，听道是从基督的话来的。' },
    ],
  },
  {
    id: 'forgiveness',
    title: '宽恕',
    subtitle: '被赦免，也去赦免',
    color: '#7d8b6f',
    verses: [
      { ref: 'MAT.6.14', text: '你们饶恕人的过犯，你们的天父也必饶恕你们的过犯。' },
      { ref: 'EPH.4.32', text: '并要以恩慈相待，存怜悯的心，彼此饶恕…' },
      { ref: '1JN.1.9', text: '我们若认自己的罪，神是信实的，是公义的，必要赦免我们的罪…' },
    ],
  },
];

export function topicById(id: string): LifeTopic | undefined {
  return LIFE_TOPICS.find((t) => t.id === id);
}
