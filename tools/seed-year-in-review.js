// Load Year in Review questions into the KSHSAA review queue.
//
// The archive's Year in Review stops at 2017 and rounds only read questions
// from this calendar year or last, so before this the slot drew on about 90
// giveaway lines imported from qbreader (import-current-events.js), several of
// them not news at all. These are written for scholars bowl instead: one
// sentence, the answer a name, place, or thing, the way the KSHSAA archive's
// own Year in Review reads.
//
// Each question is written for one level, and rounds read it only there (see
// LEVELS in routes/kshsaa-round.js):
//   beginner  the headline itself -- anyone who saw the news knows it
//   jv        one step past the headline: who, where, or what it was called
//   varsity   the detail you know only if you followed the story, as in past
//             regional and state rounds
//
// Every fact was checked against reporting as of October 2026, and the source
// is shown on the review card as the "Check" line. The month is when the story
// happened; it becomes the question's year, so a 2025 story leaves rounds in
// January 2027 instead of lingering because it was approved late.
//
// USAGE
//   node tools/seed-year-in-review.js            # report what it would insert
//   node tools/seed-year-in-review.js --write    # insert into the review queue
//   node tools/seed-year-in-review.js --level jv --show 20
//
// Safe to re-run: questions already in the queue (pending, approved, or
// rejected) are skipped, and so are stories too old for rounds to read.

import { qbreader } from '../database/databases.js';

import yargs from 'yargs/yargs';

const pending = qbreader.collection('kshsaa_pending_questions');

const LEVEL_KEYS = ['beginner', 'jv', 'varsity'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

// [level, 'YYYY-MM' the story happened, question, answer, check]
const Q = [
  // ===== Beginner =====
  ['beginner', '2026-07', 'Which country won the 2026 FIFA World Cup, beating Argentina 1-0 in extra time in the final?',
    'Spain', 'Final July 19, 2026, MetLife Stadium; Ferran Torres scored in the 106th minute (Sky Sports).'],
  ['beginner', '2026-06', 'The 2026 FIFA World Cup was hosted by Mexico, Canada, and what other country?',
    'United States [or USA; or America]', 'June 11 to July 19, 2026.'],
  ['beginner', '2026-06', 'How many teams played in the 2026 World Cup, the first to grow beyond 32?',
    '48', 'First 48-team World Cup (FIFA).'],
  ['beginner', '2026-06', 'Kansas City\'s Arrowhead Stadium hosted six games of what soccer tournament in the summer of 2026?',
    '(FIFA) World Cup', 'Argentina vs. Algeria on June 16 through a quarterfinal on July 11 (KCTV5 schedule).'],
  ['beginner', '2026-07', 'What Argentine superstar, who won the 2022 World Cup, lost the 2026 final to Spain in what was expected to be his last World Cup?',
    '(Lionel) Messi', 'Won the Silver Ball and Silver Boot with 8 goals (NBC Sports).'],
  ['beginner', '2026-02', 'The 2026 Winter Olympics were held in Milan and Cortina d\'Ampezzo in what country?',
    'Italy', 'Feb. 6-22, 2026.'],
  ['beginner', '2026-02', 'The U.S. men\'s hockey team won Olympic gold in February 2026 by beating what country 2-1 in overtime?',
    'Canada', 'Feb. 22, 2026; Jack Hughes scored; first U.S. men\'s gold since 1980 (NBC).'],
  ['beginner', '2026-02', 'Alysa Liu won Olympic gold for the United States in February 2026 in what sport?',
    'figure skating [prompt on skating]', 'First U.S. women\'s singles gold since Sarah Hughes in 2002 (NBC).'],
  ['beginner', '2026-02', 'Which NFL team won Super Bowl LX in February 2026, beating the New England Patriots 29-13?',
    'Seattle Seahawks [or Seattle]', 'Feb. 8, 2026; MVP Kenneth Walker III (Al Jazeera).'],
  ['beginner', '2026-02', 'Super Bowl LX was played in February 2026 in what state, at the home stadium of the San Francisco 49ers?',
    'California', 'Levi\'s Stadium, Santa Clara.'],
  ['beginner', '2026-02', 'What Puerto Rican singer headlined the Super Bowl halftime show in February 2026?',
    'Bad Bunny [or Benito Antonio Martinez Ocasio]', 'Super Bowl LX, Feb. 8, 2026.'],
  ['beginner', '2026-02', 'Bad Bunny won Album of the Year at the February 2026 Grammys for an album sung mostly in what language?',
    'Spanish [or espanol]', 'Debi Tirar Mas Fotos; Grammys held Feb. 1, 2026 (Rolling Stone).'],
  ['beginner', '2026-06', 'Which NBA team won its first championship since 1973 by beating the San Antonio Spurs in June 2026?',
    'New York Knicks [or New York]', 'Won the series 4-1; Jalen Brunson Finals MVP (Wikipedia, 2026 NBA Finals).'],
  ['beginner', '2026-06', 'Which NHL team won the 2026 Stanley Cup by beating the Vegas Golden Knights?',
    'Carolina Hurricanes [or Carolina]', 'Clinched 3-0 in Game 6, June 2026 (Bleacher Report).'],
  ['beginner', '2026-04', 'Which Big Ten school beat UConn 69-63 to win the 2026 NCAA men\'s basketball championship?',
    '(University of) Michigan [or Wolverines]', 'April 6, 2026, Lucas Oil Stadium, Indianapolis.'],
  ['beginner', '2026-04', 'What university\'s women\'s basketball team won its first NCAA-era national title in April 2026, beating South Carolina 79-51?',
    'UCLA [or University of California, Los Angeles; or Bruins]', 'April 5, 2026, Phoenix (NCAA.com).'],
  ['beginner', '2026-01', 'Which Big Ten school won its first college football national championship in January 2026, beating Miami 27-21?',
    'Indiana (University) [or Hoosiers]', 'Jan. 19, 2026, Hard Rock Stadium.'],
  ['beginner', '2025-12', 'Indiana quarterback Fernando Mendoza won what trophy in December 2025 as college football\'s top player?',
    'Heisman (Memorial) Trophy', 'Mendoza went first in the 2026 NFL Draft.'],
  ['beginner', '2026-07', 'Tadej Pogacar won what bicycle race for the fifth time in July 2026?',
    'Tour de France', 'Finished July 26, 2026, in Paris (NPR).'],
  ['beginner', '2026-05', 'A 23-1 long shot named Golden Tempo won what famous horse race at Churchill Downs in May 2026?',
    'Kentucky Derby', 'May 2, 2026 (Wikipedia).'],
  ['beginner', '2026-04', 'Rory McIlroy won his second green jacket in a row in April 2026 at what golf tournament?',
    '(The) Masters (Tournament)', 'April 9-12, 2026, Augusta National.'],
  ['beginner', '2026-07', 'Jannik Sinner won his second straight men\'s title in July 2026 at what tennis tournament played on grass in London?',
    'Wimbledon (Championships)', 'Beat Alexander Zverev in the final (Wikipedia).'],
  ['beginner', '2026-04', 'In April 2026, four astronauts flew around the Moon and back on what NASA mission?',
    'Artemis II [prompt on Artemis]', 'Launched April 1, splashed down April 10, 2026 (NASA).'],
  ['beginner', '2026-09', 'In September 2026, what giant SpaceX rocket reached orbit for the first time on its 14th test flight?',
    'Starship', 'Sept. 28, 2026; it released 26 Starlink satellites (AIAA).'],
  ['beginner', '2026-08', 'On August 12, 2026, a total solar eclipse could be seen from Iceland and what country on the Iberian Peninsula?',
    'Spain', 'Totality crossed Spain from A Coruna to Valencia (Spanish National Geographic Institute).'],
  ['beginner', '2026-07', 'On July 4, 2026, the United States celebrated what anniversary of the Declaration of Independence?',
    '250th [or semiquincentennial; or sestercentennial]', '1776 to 2026.'],
  ['beginner', '2026-01', 'In January 2026, U.S. forces captured Nicolas Maduro, the president of what South American country?',
    'Venezuela', 'Jan. 3, 2026; flown to New York to face federal charges (USNI News).'],
  ['beginner', '2026-02', 'Ayatollah Ali Khamenei, the supreme leader of what country, was killed in Israeli and U.S. airstrikes in February 2026?',
    'Iran', 'Feb. 28, 2026 (Wikipedia, Assassination of Ali Khamenei).'],
  ['beginner', '2026-01', 'In January 2026, President Trump threatened tariffs on European countries in a dispute over his push to acquire what Arctic island?',
    'Greenland', 'Dropped the threat Jan. 21, 2026, citing a "framework" deal with NATO.'],
  ['beginner', '2026-06', 'In June 2026, Keir Starmer announced he would resign as prime minister of what country?',
    'United Kingdom [or UK; or Great Britain; accept England]', 'Announced June 22, 2026; Andy Burnham took over July 20.'],
  ['beginner', '2026-03', 'Which film won Best Picture at the Academy Awards in March 2026?',
    'One Battle After Another', '98th Oscars, March 15, 2026; six wins (PBS).'],
  ['beginner', '2026-07', 'Christopher Nolan\'s July 2026 film "The Odyssey" is based on an epic poem by what ancient Greek poet?',
    'Homer', 'Released July 17, 2026.'],
  ['beginner', '2026-04', 'What Nintendo plumber starred in a movie subtitled "Galaxy" that came out in April 2026?',
    'Mario [or Super Mario]', 'The Super Mario Galaxy Movie, April 2026.'],
  ['beginner', '2026-06', 'Woody and Buzz Lightyear returned in what Pixar movie in June 2026?',
    'Toy Story 5', 'Released June 19, 2026.'],
  ['beginner', '2026-04', 'Jaafar Jackson played his uncle, the "King of Pop," in what April 2026 biopic?',
    'Michael', 'Michael Jackson biopic, April 2026.'],
  ['beginner', '2026-07', 'Tom Holland starred in "Brand New Day," a July 2026 film about what Marvel superhero?',
    'Spider-Man [or Peter Parker]', 'Spider-Man: Brand New Day, released July 31, 2026.'],
  ['beginner', '2026-09', 'Gloria Steinem, who died in September 2026 at age 92, was a famous leader of what movement?',
    'feminism [or women\'s movement; or women\'s liberation; or women\'s rights movement]', 'Died Sept. 2, 2026, in New York (ABC News).'],
  ['beginner', '2026-09', 'Pope Leo XIV made a four-day visit in late September 2026 to what country, stopping in Paris and Lourdes?',
    'France', 'Sept. 25-28, 2026; first papal state visit to France in 18 years (Vatican News).'],
  ['beginner', '2026-05', 'Pope Leo XIV\'s first encyclical, published in May 2026, is about human dignity in the age of what technology?',
    'artificial intelligence [or AI]', 'Magnifica humanitas, published May 25, 2026 (Vatican News).'],
  ['beginner', '2025-12', 'In December 2025, the Kansas City Chiefs announced they will move to a new domed stadium in what state?',
    'Kansas', 'Wyandotte County site, set to open in 2031 (Missouri Independent, Dec. 22, 2025).'],
  ['beginner', '2025-05', 'In May 2025, Chicago-born Robert Prevost became the first pope from what country?',
    'United States [or USA; or America]', 'Elected May 8, 2025, taking the name Leo XIV.'],
  ['beginner', '2025-04', 'Pope Francis died in April 2025, one day after celebrating what Christian holiday?',
    'Easter', 'Died April 21, 2025, Easter Monday.'],
  ['beginner', '2025-02', 'Which NFL team won Super Bowl LIX in February 2025, beating the Kansas City Chiefs 40-22?',
    'Philadelphia Eagles [or Philadelphia]', 'Feb. 9, 2025, New Orleans; MVP Jalen Hurts.'],
  ['beginner', '2025-11', 'In November 2025, the U.S. Mint in Philadelphia made its last coins of what value for circulation?',
    'penny [or one cent; or cent]', 'Final strike Nov. 12, 2025, after 232 years (AP).'],
  ['beginner', '2025-01', 'In January 2025, President Trump signed an order renaming the Gulf of Mexico as the Gulf of what?',
    'America', 'Executive order of Jan. 20, 2025.'],
  ['beginner', '2025-08', 'Taylor Swift announced in August 2025 that she is engaged to what Kansas City Chiefs tight end?',
    '(Travis) Kelce', 'Announced Aug. 26, 2025.'],
  ['beginner', '2025-08', 'What streaming service released "KPop Demon Hunters," which became its most-watched movie ever in 2025?',
    'Netflix', 'Passed Red Notice in August 2025.'],
  ['beginner', '2025-07', 'Ozzy Osbourne, who died in July 2025, was the lead singer of what heavy metal band?',
    'Black Sabbath', 'Died July 22, 2025, weeks after a farewell concert in Birmingham, England.'],
  ['beginner', '2025-06', 'Which NBA team won the 2025 championship by beating the Indiana Pacers in seven games?',
    'Oklahoma City Thunder [or OKC; or Oklahoma City]', 'Game 7 June 22, 2025; Shai Gilgeous-Alexander Finals MVP.'],
  ['beginner', '2025-11', 'The Los Angeles Dodgers won their second straight World Series in November 2025 by beating what team in seven games?',
    'Toronto Blue Jays [or Toronto]', 'Game 7 won 5-4 in 11 innings, Nov. 1, 2025 (Flashscore).'],
  ['beginner', '2025-04', 'The University of Florida won the 2025 NCAA men\'s championship in what sport?',
    'basketball', 'Beat Houston 65-63, April 7, 2025.'],
  ['beginner', '2025-10', 'Hurricane Melissa hit what Caribbean island in October 2025 as a Category 5 storm, the strongest ever to strike it?',
    'Jamaica', 'Landfall Oct. 28, 2025, with 185 mph winds (EarthSky).'],
  ['beginner', '2025-07', 'Flash floods along the Guadalupe River on July 4, 2025, killed more than 130 people in what state?',
    'Texas', 'Kerr County was hardest hit, including Camp Mystic.'],
  ['beginner', '2025-01', 'The Palisades and Eaton wildfires destroyed thousands of homes in January 2025 around what California city?',
    'Los Angeles [or LA]', 'Both began Jan. 7, 2025.'],
  ['beginner', '2025-03', 'Astronauts Butch Wilmore and Suni Williams returned to Earth in March 2025 after about nine months aboard what orbiting laboratory?',
    'International Space Station [or ISS]', 'Splashed down March 18, 2025, after a planned eight-day Starliner flight.'],
  ['beginner', '2025-04', 'In April 2025, Blue Origin flew an all-woman crew to the edge of space that included what pop singer of "Roar"?',
    'Katy Perry', 'Flight NS-31, April 14, 2025.'],
  ['beginner', '2025-06', 'Nintendo released what video game console in June 2025, the successor to its 2017 hybrid system?',
    'Nintendo Switch 2 [prompt on Switch]', 'Launched June 5, 2025.'],
  ['beginner', '2025-10', 'Microsoft stopped free security updates in October 2025 for what version of its operating system, released in 2015?',
    'Windows 10', 'Support ended Oct. 14, 2025.'],
  ['beginner', '2025-10', 'Jane Goodall, who died in October 2025, spent decades studying what animals in Tanzania?',
    'chimpanzees [or chimps]', 'Died Oct. 1, 2025, at 91.'],
  ['beginner', '2025-10', 'Venezuelan opposition leader Maria Corina Machado won what famous prize in October 2025?',
    'Nobel Peace Prize', 'Announced Oct. 10, 2025.'],

  // ===== JV =====
  ['jv', '2026-07', 'What French striker won the Golden Boot at the 2026 World Cup with 10 goals, the first player to win it twice?',
    '(Kylian) Mbappe', 'Messi had the Silver Boot with 8 (NBC Sports).'],
  ['jv', '2026-07', 'Spain\'s 2026 World Cup title was its second. In what year did it win its first?',
    '2010', 'Beat the Netherlands in South Africa.'],
  ['jv', '2026-07', 'The 2026 World Cup final was played at MetLife Stadium in what state?',
    'New Jersey', 'East Rutherford, July 19, 2026.'],
  ['jv', '2026-02', 'Kenneth Walker III was MVP of Super Bowl LX in February 2026, the first player at what position to win it since Terrell Davis in 1998?',
    'running back [or halfback; or tailback; prompt on back]', '135 rushing yards (Al Jazeera).'],
  ['jv', '2026-06', 'Who was named NBA Finals MVP in June 2026 after leading the Knicks to their first title since 1973?',
    '(Jalen) Brunson', '45 points in the clinching game (Wikipedia, 2026 NBA Finals).'],
  ['jv', '2026-06', 'The Carolina Hurricanes won the 2026 Stanley Cup by beating what team in six games?',
    'Vegas Golden Knights [or Vegas]', 'Clinched 3-0 in Game 6 (Bleacher Report).'],
  ['jv', '2026-04', 'Jeremy Hansen became the first person from what country to travel around the Moon on Artemis II in April 2026?',
    'Canada', 'Canadian Space Agency astronaut (NASA).'],
  ['jv', '2026-09', 'SpaceX\'s Starship reached orbit for the first time in September 2026 and released 26 satellites for what SpaceX internet service?',
    'Starlink', 'Flight 14, Sept. 28, 2026 (AIAA).'],
  ['jv', '2026-03', 'Michael B. Jordan won Best Actor at the March 2026 Oscars for what Ryan Coogler film?',
    'Sinners', 'His first Oscar (PBS).'],
  ['jv', '2026-03', 'Ryan Gosling plays a science teacher who wakes up alone on a spaceship in what March 2026 film based on an Andy Weir novel?',
    'Project Hail Mary', 'Released March 2026.'],
  ['jv', '2026-01', 'In January 2026, U.S. forces captured Nicolas Maduro in what capital city?',
    'Caracas', 'Jan. 3, 2026 (USNI News).'],
  ['jv', '2026-02', 'Ali Khamenei, killed in February 2026, had held what title, the highest office in Iran, since 1989?',
    'Supreme Leader (of Iran)', 'Killed Feb. 28, 2026 (Wikipedia).'],
  ['jv', '2026-03', 'In March 2026, Iran moved to block what strait, a chokepoint for much of the world\'s oil?',
    'Strait of Hormuz', 'Late March 2026 (Wikipedia, 2026 Iran war).'],
  ['jv', '2026-02', 'In February 2026, the Supreme Court ruled 6-3 that an emergency powers law does not let the president impose what taxes on imports?',
    'tariffs [or duties]', 'Learning Resources v. Trump, Feb. 20, 2026 (DLA Piper).'],
  ['jv', '2026-05', 'Kevin Warsh took office in May 2026 as chair of what institution, succeeding Jerome Powell?',
    'Federal Reserve [or the Fed; accept Federal Reserve Board]', 'Sworn in May 22, 2026, at the White House.'],
  ['jv', '2026-07', 'Who became prime minister of the United Kingdom in July 2026 after Keir Starmer resigned?',
    '(Andy) Burnham', 'Labour leader unopposed July 17; prime minister July 20, 2026 (Wikipedia).'],
  ['jv', '2026-06', 'Keir Starmer\'s June 2026 resignation set off a leadership contest in what political party, which Andy Burnham won unopposed?',
    'Labour (Party)', '2026 Labour leadership election (Wikipedia).'],
  ['jv', '2026-04', 'Peter Magyar\'s Tisza party ended Viktor Orban\'s 16 years in power in an April 2026 election in what country?',
    'Hungary', 'April 12, 2026 (Al Jazeera).'],
  ['jv', '2026-02', 'Prime Minister Sanae Takaichi\'s party won a two-thirds majority in a February 2026 snap election in what country?',
    'Japan', 'Feb. 8, 2026; the LDP won 316 of 465 seats (Al Jazeera).'],
  ['jv', '2026-02', 'Rob Jetten became the youngest prime minister in the history of what country in February 2026?',
    'Netherlands [or Holland]', 'Sworn in Feb. 23, 2026, at 38.'],
  ['jv', '2026-03', 'Jose Antonio Kast was inaugurated in March 2026 as president of what South American country?',
    'Chile', 'March 11, 2026, in Valparaiso (OPB).'],
  ['jv', '2026-02', 'Tarique Rahman became prime minister of what South Asian country in February 2026, after 17 years in exile?',
    'Bangladesh', 'First election since the 2024 uprising (Al Jazeera).'],
  ['jv', '2026-08', 'In August 2026, Kansas Senate President Ty Masterson won the Republican nomination for what office?',
    'governor of Kansas [prompt on governor]', 'Primary Aug. 4, 2026; general election Nov. 3 (Wikipedia).'],
  ['jv', '2026-08', 'Cindy Holscher won the August 2026 Democratic primary to succeed what term-limited governor of Kansas?',
    '(Laura) Kelly', 'Kelly cannot seek a third straight term (Wikipedia).'],
  ['jv', '2026-05', 'A law passed by the Kansas Legislature in 2026 requires school districts to ban students from using what devices during the school day?',
    'cell phones [or smartphones; or phones; accept personal electronic devices]', 'Senate Sub. for HB 2299 (Kansas Legislative Research Department).'],
  ['jv', '2025-12', 'The Kansas City Chiefs announced in December 2025 that they will build a domed stadium in what Kansas county?',
    'Wyandotte County', 'Practice facility in Olathe; opening set for 2031 (Missouri Independent).'],
  ['jv', '2026-06', 'With the second pick in the 2026 NBA Draft, the Utah Jazz chose what University of Kansas guard?',
    '(Darryn) Peterson', 'Washington took AJ Dybantsa first (Geo Super).'],
  ['jv', '2026-06', 'The Washington Wizards made AJ Dybantsa the first pick of the 2026 NBA Draft. What Utah university did he play for?',
    'Brigham Young University [or BYU]', '(Geo Super).'],
  ['jv', '2026-04', 'With the first pick in the 2026 NFL Draft, the Las Vegas Raiders chose what Heisman-winning Indiana quarterback?',
    '(Fernando) Mendoza', 'April 23, 2026 (NFL.com).'],
  ['jv', '2026-07', 'Czech player Linda Noskova won her first Grand Slam title in July 2026 at what tournament?',
    'Wimbledon (Championships)', 'Beat Karolina Muchova in the final (Wikipedia).'],
  ['jv', '2026-06', 'Alexander Zverev won his first Grand Slam title in June 2026 at what clay-court tournament in Paris?',
    'French Open [or Roland Garros]', 'Beat Flavio Cobolli in the final (Wikipedia).'],
  ['jv', '2026-09', 'Which German player won the men\'s singles title at the 2026 US Open, beating American Ben Shelton?',
    '(Alexander) Zverev', 'Final Sept. 13, 2026 (Wikipedia).'],
  ['jv', '2026-01', 'Carlos Alcaraz beat Novak Djokovic in the January 2026 Australian Open final to complete what achievement?',
    'career Grand Slam [accept descriptions of winning all four major tournaments]', 'Alcaraz already held the other three majors (Wikipedia).'],
  ['jv', '2026-04', 'Rory McIlroy won the 2026 Masters by one stroke over what American who had won it in 2022 and 2024?',
    '(Scottie) Scheffler', '(KTVU).'],
  ['jv', '2026-05', 'Felix Rosenqvist won what race in May 2026 by about two hundredths of a second, the closest finish in its history?',
    'Indianapolis 500 [or Indy 500]', 'May 24, 2026; margin 0.0232 seconds.'],
  ['jv', '2026-05', 'With Golden Tempo\'s May 2026 Kentucky Derby win, Cherie DeVaux became the first woman to win the Derby in what role?',
    'trainer', '(Wikipedia, 2026 Kentucky Derby).'],
  ['jv', '2026-06', 'Oklahoma beat North Carolina 13-2 in the deciding game in June 2026 to win what championship played in Omaha?',
    'College World Series [or Men\'s College World Series; accept NCAA baseball championship]', 'First title since 1994.'],
  ['jv', '2026-08', 'A team from Willemstad won the 2026 Little League World Series. Willemstad is on what Caribbean island?',
    'Curacao', 'Beat Henderson, Nev., 11-2 (Wikipedia).'],
  ['jv', '2026-02', 'Which country won the most medals at the 2026 Winter Olympics?',
    'Norway', '41 medals, 18 gold; the U.S. was second with 33 (theScore).'],
  ['jv', '2026-02', 'Norway\'s Johannes Hosterud Klaebo set a record for Winter Olympic gold medals in February 2026 in what sport?',
    'cross-country skiing [prompt on skiing]', 'Six golds in 2026, 11 in his career (theScore).'],
  ['jv', '2026-02', 'Who scored the overtime goal that won Olympic hockey gold for the U.S. men over Canada in February 2026?',
    '(Jack) Hughes', '3-on-3 overtime, Feb. 22, 2026 (NBC).'],
  ['jv', '2026-02', 'Olivia Dean won what Grammy in February 2026, given to the year\'s top newcomer?',
    'Best New Artist', 'Feb. 1, 2026.'],
  ['jv', '2026-02', 'Kendrick Lamar and SZA won Record of the Year at the February 2026 Grammys for what song?',
    '"Luther"', '(Rolling Stone).'],
  ['jv', '2026-05', 'Bulgaria won the Eurovision Song Contest for the first time in May 2026 in what capital city?',
    'Vienna [or Wien]', 'Final May 16, 2026.'],
  ['jv', '2026-09', '"The Pitt," which won Outstanding Drama Series at the Emmys in September 2026, is set in a hospital in what city?',
    'Pittsburgh', 'Noah Wyle won Lead Actor for the second straight year (Good Morning America).'],
  ['jv', '2025-10', 'Sanae Takaichi became the first woman to hold what office in October 2025?',
    'prime minister of Japan [prompt on prime minister]', 'Took office Oct. 21, 2025.'],
  ['jv', '2025-11', 'In November 2025, Abigail Spanberger was elected the first woman governor of what state?',
    'Virginia', 'Nov. 4, 2025.'],
  ['jv', '2025-11', 'Mikie Sherrill won the November 2025 race for governor of what state?',
    'New Jersey', 'Nov. 4, 2025.'],
  ['jv', '2025-11', 'The federal government shutdown that ended on November 12, 2025, was the longest ever, lasting how many days?',
    '43', 'Oct. 1 to Nov. 12, 2025.'],
  ['jv', '2025-06', 'In June 2025, U.S. B-2 bombers struck nuclear sites at Fordow, Natanz, and Isfahan in what country?',
    'Iran', 'Operation Midnight Hammer, June 22, 2025.'],
  ['jv', '2025-05', 'Friedrich Merz became chancellor of what country in May 2025?',
    'Germany', 'Elected by the Bundestag May 6, 2025.'],
  ['jv', '2025-06', 'Lee Jae-myung was elected president of what country in June 2025, after his predecessor was removed from office?',
    'South Korea [or Republic of Korea]', 'June 3, 2025.'],
  ['jv', '2025-07', 'President Trump signed a tax and spending law on July 4, 2025, known by what nickname?',
    'One Big Beautiful Bill (Act)', 'Signed July 4, 2025.'],
  ['jv', '2025-01', 'The Department of Government Efficiency, created in January 2025, was known by what four-letter abbreviation?',
    'DOGE', 'Led early on by Elon Musk.'],
  ['jv', '2025-09', 'Conservative activist Charlie Kirk was shot and killed in September 2025 while speaking at a university in what state?',
    'Utah', 'Utah Valley University, Orem, Sept. 10, 2025.'],
  ['jv', '2025-10', 'Under an October 2025 ceasefire, Hamas released the last 20 living hostages it held in what territory?',
    'Gaza (Strip)', 'Released Oct. 13, 2025 (PBS).'],
  ['jv', '2025-12', 'Time magazine\'s 2025 Person of the Year was a group of business leaders it called the "architects" of what technology?',
    'artificial intelligence [or AI]', '(CBS News).'],
  ['jv', '2025-12', 'Merriam-Webster\'s 2025 Word of the Year, for low-quality content mass-produced by AI, is what four-letter word?',
    'slop', '(Fox News).'],
  ['jv', '2025-07', 'Comet 3I/ATLAS, found in July 2025, is only the third known object to visit our solar system from where?',
    'interstellar space [or another star system; accept outside the solar system]', 'Discovered July 1, 2025.'],
  ['jv', '2025-11', 'Pitcher Yoshinobu Yamamoto was named World Series MVP in November 2025 for what team?',
    'Los Angeles Dodgers [or LA Dodgers]', 'Won three games in the Series (Sports Illustrated).'],
  ['jv', '2025-09', 'Europe won the Ryder Cup in September 2025 at Bethpage Black, a golf course in what state?',
    'New York', 'Europe won 15-13.'],
  ['jv', '2025-09', 'Robert Redford, who died in September 2025, founded what film festival in Utah?',
    'Sundance (Film Festival)', 'Died Sept. 16, 2025.'],
  ['jv', '2025-05', 'In May 2025, India launched "Operation Sindoor" against targets in what neighboring country?',
    'Pakistan', 'After the Pahalgam attack in Kashmir.'],
  ['jv', '2025-01', 'An Army Black Hawk and a passenger jet collided in January 2025 over what river near Washington, D.C.?',
    'Potomac (River)', 'Jan. 29, 2025; 67 killed.'],
  ['jv', '2025-07', 'In July 2025, Nvidia became the first company valued at how many trillion dollars?',
    'four [or $4 trillion]', 'July 9, 2025; it passed $5 trillion in October.'],
  ['jv', '2025-11', 'Dick Cheney, who died in November 2025, was vice president under what president?',
    'George W. Bush [prompt on Bush]', 'Died Nov. 3, 2025.'],
  ['jv', '2025-04', 'In April 2025, Colossal Biosciences said gene editing had brought back what extinct animal, known from "Game of Thrones"?',
    'dire wolf', 'Pups Romulus, Remus, and Khaleesi.'],
  ['jv', '2025-03', 'Firefly Aerospace\'s Blue Ghost made the first fully successful commercial landing in March 2025 on what world?',
    '(Earth\'s) Moon', 'March 2, 2025, Mare Crisium.'],
  ['jv', '2025-05', 'Before becoming Pope Leo XIV, Robert Prevost served for years as a missionary and bishop in what South American country?',
    'Peru', 'He holds Peruvian citizenship.'],
  ['jv', '2025-01', 'A January 2025 order restored the name Mount McKinley to North America\'s tallest peak, which had officially been called what since 2015?',
    'Denali', 'Executive order of Jan. 20, 2025.'],
  ['jv', '2025-06', 'The Florida Panthers won their second straight Stanley Cup in June 2025, again beating what team in the Final?',
    'Edmonton Oilers [or Edmonton]', 'Clinched in Game 6.'],

  // ===== Varsity =====
  ['varsity', '2026-07', 'What Spanish midfielder won the Golden Ball as the best player of the 2026 World Cup?',
    'Rodri [or Rodrigo Hernandez Cascante]', 'Messi took the Silver Ball, Mbappe the Bronze (NBC Sports).'],
  ['varsity', '2026-07', 'Who scored the only goal of the 2026 World Cup final, in extra time, to give Spain the title?',
    '(Ferran) Torres', '106th minute, July 19, 2026 (Sky Sports).'],
  ['varsity', '2026-07', 'Argentina played extra time in the 2026 World Cup final with ten men after what midfielder was sent off for a late tackle on Pau Cubarsi?',
    '(Enzo) Fernandez', 'Red card in injury time (Sky Sports, IOL).'],
  ['varsity', '2026-07', 'What Spanish goalkeeper won the Golden Glove at the 2026 World Cup?',
    '(Unai) Simon', '(NBC Sports).'],
  ['varsity', '2026-06', 'Argentina opened its 2026 World Cup title defense at Arrowhead Stadium in Kansas City against what African country?',
    'Algeria', 'June 16, 2026 (Lawrence Journal-World schedule).'],
  ['varsity', '2026-04', 'Who commanded NASA\'s Artemis II mission around the Moon in April 2026?',
    '(Reid) Wiseman', '(NASA).'],
  ['varsity', '2026-04', 'What NASA astronaut became the first woman to travel around the Moon on Artemis II in April 2026?',
    '(Christina) Koch', '(NASA).'],
  ['varsity', '2026-04', 'The Orion capsule from Artemis II splashed down in April 2026 in the Pacific Ocean off what California city?',
    'San Diego', 'April 10, 2026 (NASA).'],
  ['varsity', '2026-02', 'What son of Ali Khamenei became Iran\'s supreme leader after his father was killed in February 2026?',
    'Mojtaba Khamenei [prompt on Khamenei]', '(Al Jazeera).'],
  ['varsity', '2026-02', 'What name did the United States give the operation it launched with Israel against Iran on February 28, 2026?',
    'Operation Epic Fury', 'Israel\'s part was Operation Roaring Lion (Wikipedia, 2026 Iran war).'],
  ['varsity', '2026-01', 'What Venezuelan vice president became interim president after Nicolas Maduro was captured in January 2026?',
    '(Delcy) Rodriguez', '(USNI News).'],
  ['varsity', '2026-01', 'What name did the U.S. military give the January 2026 raid that captured Nicolas Maduro?',
    'Operation Absolute Resolve', '(USNI News).'],
  ['varsity', '2026-01', 'President Trump said in January 2026 that he had agreed on a "framework" deal over Greenland with what NATO secretary general?',
    '(Mark) Rutte', 'At Davos, Jan. 21, 2026.'],
  ['varsity', '2026-02', 'What chief justice wrote the majority opinion in Learning Resources v. Trump, the February 2026 ruling against tariffs imposed under an emergency powers law?',
    '(John) Roberts', 'Decided 6-3, Feb. 20, 2026 (DLA Piper).'],
  ['varsity', '2026-06', 'The Supreme Court\'s June 2026 ruling in Trump v. Barbara held that an executive order on birthright citizenship violated what amendment?',
    'Fourteenth Amendment [or 14th]', 'Decided June 30, 2026 (Congressional Research Service).'],
  ['varsity', '2026-05', 'Who was sworn in as chair of the Federal Reserve in May 2026?',
    '(Kevin) Warsh', 'May 22, 2026.'],
  ['varsity', '2026-04', 'Who became prime minister of Hungary after his Tisza party defeated Viktor Orban in April 2026?',
    '(Peter) Magyar', 'Sworn in May 9, 2026 (Al Jazeera).'],
  ['varsity', '2026-07', 'Before becoming British prime minister in July 2026, Andy Burnham was mayor of what English region?',
    'Greater Manchester [or Manchester]', '(Wikipedia).'],
  ['varsity', '2026-02', 'What party does Bangladeshi prime minister Tarique Rahman lead, which won a two-thirds majority in February 2026?',
    'Bangladesh Nationalist Party [or BNP]', '(Al Jazeera).'],
  ['varsity', '2026-02', 'Rob Jetten, who became Dutch prime minister in February 2026, leads what party known by a name and a number?',
    'Democrats 66 [or D66; or Democraten 66]', '(ALDE Party).'],
  ['varsity', '2026-02', 'In February 2026, Japan\'s Liberal Democratic Party won 316 of 465 lower-house seats, the biggest margin in postwar Japan, under what prime minister?',
    '(Sanae) Takaichi', 'Feb. 8, 2026 (Al Jazeera).'],
  ['varsity', '2026-06', 'Who won Colombia\'s June 2026 presidential runoff, succeeding Gustavo Petro?',
    '(Abelardo) de la Espriella', 'Beat Ivan Cepeda 49.66% to 48.70% on June 21 (Wikipedia).'],
  ['varsity', '2026-05', 'What is the Latin title of Pope Leo XIV\'s first encyclical, published in May 2026, on human dignity and artificial intelligence?',
    'Magnifica humanitas', 'Signed May 15, the anniversary of Rerum novarum (Vatican News).'],
  ['varsity', '2026-05', 'Dara won Eurovision in May 2026 with the song "Bangaranga," the first win for what country?',
    'Bulgaria', '516 points; final May 16, 2026, in Vienna.'],
  ['varsity', '2026-07', 'Ryan Fox won the 2026 Open Championship at Royal Birkdale, the first golfer from what country to win the Open since Bob Charles in 1963?',
    'New Zealand', 'Won by one over Cameron Young (Wikipedia).'],
  ['varsity', '2026-06', 'Wyndham Clark won his second U.S. Open in June 2026, leading wire to wire at what Long Island course?',
    'Shinnecock Hills (Golf Club)', 'Won by one over Sam Burns (Wikipedia).'],
  ['varsity', '2026-05', 'Aaron Rai won the 2026 PGA Championship, the first golfer from what country to win it since Jim Barnes in 1919?',
    'England [accept United Kingdom or Great Britain]', 'Aronimink, May 17, 2026 (Wikipedia).'],
  ['varsity', '2026-06', 'Mirra Andreeva won her first Grand Slam singles title in June 2026 at what tournament?',
    'French Open [or Roland Garros]', '(Wikipedia, 2026 French Open).'],
  ['varsity', '2026-06', 'What 37-year-old Carolina Hurricanes captain won the 2026 Conn Smythe Trophy, the oldest player ever to win it?',
    '(Jordan) Staal', 'Six goals in the Final (Bleacher Report).'],
  ['varsity', '2026-02', 'Alysa Liu\'s February 2026 gold was the first by an American woman in Olympic figure skating singles since what skater won in 2002?',
    '(Sarah) Hughes', 'Salt Lake City, 2002 (NBC).'],
  ['varsity', '2026-02', 'What Norwegian cross-country skier won six gold medals at the 2026 Winter Olympics, giving him a record 11 Winter Olympic titles?',
    '(Johannes Hosterud) Klaebo', '(theScore).'],
  ['varsity', '2026-02', 'Super Bowl LX was played in February 2026 at Levi\'s Stadium in what city?',
    'Santa Clara', 'Feb. 8, 2026.'],
  ['varsity', '2026-02', 'What Seahawks kicker scored 17 points in Super Bowl LX, the most ever by a kicker in a Super Bowl?',
    '(Jason) Myers', '(Al Jazeera).'],
  ['varsity', '2026-04', 'Michigan\'s Elliot Cadeau was named Most Outstanding Player of the 2026 Final Four after Michigan beat what school in the title game?',
    'Connecticut [or UConn]', '69-63, April 6, 2026.'],
  ['varsity', '2026-01', 'Who coached Indiana to the 2026 college football national championship in only his second season there?',
    '(Curt) Cignetti', 'Hired after the 2023 season.'],
  ['varsity', '2026-07', 'Tadej Pogacar\'s fifth Tour de France win in July 2026 tied the record of Jacques Anquetil, Eddy Merckx, Bernard Hinault, and what Spaniard?',
    '(Miguel) Indurain', '(NPR).'],
  ['varsity', '2026-05', 'What Swedish driver won the 2026 Indianapolis 500 in the closest finish in the race\'s history?',
    '(Felix) Rosenqvist', 'Beat David Malukas by 0.0232 seconds.'],
  ['varsity', '2026-05', 'Who rode Golden Tempo to victory in the 2026 Kentucky Derby?',
    '(Jose) Ortiz', 'May 2, 2026 (Wikipedia).'],
  ['varsity', '2026-08', 'The total solar eclipse of August 12, 2026, was the first visible from Spain since what year?',
    '1905', 'Spanish National Geographic Institute.'],
  ['varsity', '2026-09', 'Gloria Steinem, who died in September 2026, co-founded what feminist magazine in the early 1970s?',
    'Ms. (magazine)', '(ABC News).'],
  ['varsity', '2026-09', '"Widow\'s Bay" set a record for Emmy wins by a comedy series in September 2026. Who won Lead Actor in a Comedy for starring in it?',
    '(Matthew) Rhys', '14 wins (Good Morning America).'],
  ['varsity', '2026-09', 'Jean Smart won her eighth career Emmy in September 2026 for playing comedian Deborah Vance on what series?',
    'Hacks', '(Good Morning America).'],
  ['varsity', '2026-09', 'Rhea Seehorn won the 2026 Emmy for Lead Actress in a Drama for what Apple TV series created by Vince Gilligan?',
    'Pluribus', '(Good Morning America).'],
  ['varsity', '2026-08', 'Who won the Republican nomination for governor of Kansas in August 2026?',
    '(Ty) Masterson', '43.2% in a seven-candidate primary, Aug. 4, 2026 (Wikipedia).'],
  ['varsity', '2026-08', 'Who won the Democratic nomination for governor of Kansas in August 2026?',
    '(Cindy) Holscher', '48.6% of the vote, Aug. 4, 2026 (Wikipedia).'],
  ['varsity', '2025-12', 'The Kansas City Chiefs\' planned stadium in Kansas will be paid for largely with what kind of bonds, repaid from sales and liquor taxes in a special district?',
    'STAR bonds [or Sales Tax and Revenue bonds]', 'Approved by the Legislative Coordinating Council in December 2025 (Bond Buyer).'],
  ['varsity', '2025-06', 'Operation Midnight Hammer in June 2025 used 30,000-pound bunker busters on what Iranian enrichment site buried in a mountain near Qom?',
    'Fordow', 'June 22, 2025.'],
  ['varsity', '2025-06', 'The June 2025 war between Israel and Iran is commonly named for its length. Give that name.',
    'Twelve-Day War [or 12-Day War]', 'June 13-24, 2025.'],
  ['varsity', '2025-10', 'In October 2025, thieves used a truck-mounted lift to break into the Louvre gallery named for what Greek god, stealing French crown jewels?',
    'Apollo [or Galerie d\'Apollon]', 'Oct. 19, 2025.'],
  ['varsity', '2025-06', 'The Vera C. Rubin Observatory released its first images in June 2025 from a mountaintop in what country?',
    'Chile', 'Cerro Pachon, June 23, 2025.'],
  ['varsity', '2025-10', 'Laszlo Krasznahorkai, winner of the 2025 Nobel Prize in Literature, is from what country?',
    'Hungary', 'Announced Oct. 9, 2025.'],
  ['varsity', '2025-10', 'The 2025 Nobel Prize in Chemistry honored the development of porous materials known by what three-letter abbreviation?',
    'MOFs [or metal-organic frameworks]', 'Kitagawa, Robson, and Yaghi.'],
  ['varsity', '2025-09', 'Who became Nepal\'s first female prime minister in September 2025 after "Gen Z" protests forced out K.P. Sharma Oli?',
    '(Sushila) Karki', 'Interim prime minister from Sept. 12, 2025.'],
  ['varsity', '2025-11', 'In November 2025, Ahmed al-Sharaa became the first leader of what country ever to visit the White House?',
    'Syria', 'Nov. 10, 2025.'],
  ['varsity', '2025-09', 'Seattle Mariners catcher Cal Raleigh set a record for catchers in 2025 by hitting how many home runs?',
    '60', 'Most ever by a catcher.'],
  ['varsity', '2025-07', 'Chelsea won the expanded FIFA Club World Cup in July 2025 by beating what French club 3-0 in the final?',
    'Paris Saint-Germain [or PSG]', 'July 13, 2025, MetLife Stadium.'],
  ['varsity', '2025-07', 'England won the 2025 Women\'s European Championship by beating what country on penalties in the final?',
    'Spain', 'July 27, 2025, in Basel.'],
  ['varsity', '2025-07', 'Iga Swiatek won the 2025 Wimbledon final 6-0, 6-0 over what American?',
    '(Amanda) Anisimova', 'July 12, 2025.'],
  ['varsity', '2025-11', 'California\'s Proposition 50, approved in November 2025, redrew the state\'s districts for elections to what body?',
    'U.S. House of Representatives [or House; accept Congress]', 'Nov. 4, 2025.'],
  ['varsity', '2025-03', 'Former Philippine president Rodrigo Duterte was arrested in March 2025 and flown to what Dutch city to face the International Criminal Court?',
    'The Hague [or Den Haag]', 'March 2025.'],
  ['varsity', '2025-04', 'South Korea\'s Constitutional Court removed Yoon Suk Yeol in April 2025 over his December 2024 declaration of what?',
    'martial law', 'April 4, 2025.'],
  ['varsity', '2025-05', 'Pope Leo XIV belongs to a religious order named for what 4th-century bishop of Hippo?',
    '(Saint) Augustine (of Hippo) [accept Augustinians or Order of Saint Augustine]', 'Elected May 8, 2025.'],
  ['varsity', '2025-11', 'Pope Leo XIV\'s first trip abroad, in late November 2025, took him to Turkey and what other country?',
    'Lebanon', '(NPR).'],
  ['varsity', '2025-12', 'The Oxford University Press chose what two-word phrase, for online content meant to provoke anger, as its 2025 Word of the Year?',
    'rage bait', 'Announced Dec. 1, 2025.'],
  ['varsity', '2025-06', 'An Air India Boeing 787 crashed in June 2025 shortly after takeoff from what city, leaving one survivor?',
    'Ahmedabad', 'Flight AI171, June 12, 2025.'],
  ['varsity', '2025-10', 'Diane Keaton, who died in October 2025, won an Oscar for the title role in what 1977 Woody Allen film?',
    'Annie Hall', 'Died Oct. 11, 2025.'],
  ['varsity', '2025-03', 'Mark Carney, who became Canada\'s prime minister in March 2025, had earlier led the central banks of Canada and what other country?',
    'United Kingdom [or UK; or Britain; accept Bank of England]', 'Sworn in March 14, 2025.'],
  ['varsity', '2025-12', 'What billionaire commercial astronaut was confirmed as NASA administrator in December 2025?',
    '(Jared) Isaacman', 'Confirmed 67-30, Dec. 17, 2025.'],
  ['varsity', '2025-01', 'The U.S. had 2,242 measles cases in 2025, the most since 1992, driven by an outbreak that began that January in what state?',
    'Texas', 'Gaines County, West Texas (NPR, Jan. 31, 2026).']
];

const argv = yargs(process.argv.slice(2))
  .option('write', { type: 'boolean', default: false, description: 'insert into kshsaa_pending_questions' })
  .option('level', { type: 'string', description: 'only this level: beginner, jv, or varsity' })
  .option('show', { type: 'number', default: 6, description: 'how many samples to print on a dry run' })
  .help()
  .argv;

// rounds read Year in Review from last calendar year on (kshsaa-round.js)
const oldestYear = new Date().getFullYear() - 1;
const now = new Date();

const built = [];
const problems = [];
const tooOld = [];
const seen = new Set();
for (const [level, month, question, answer, check] of Q) {
  if (argv.level && level !== argv.level) { continue; }
  const [year, m] = month.split('-').map(Number);
  const where = `${month} ${question.slice(0, 60)}`;
  if (!LEVEL_KEYS.includes(level)) { problems.push(`unknown level "${level}": ${where}`); continue; }
  if (!(year >= 2000 && m >= 1 && m <= 12)) { problems.push(`bad month: ${where}`); continue; }
  if (new Date(year, m - 1, 1) > now) { problems.push(`month is in the future: ${where}`); continue; }
  if (!question.trim().endsWith('?') && !question.trim().endsWith('.')) { problems.push(`not a sentence: ${where}`); continue; }
  if (!answer.trim() || !check.trim()) { problems.push(`missing answer or check: ${where}`); continue; }
  const key = question.replace(/\s+/g, ' ').trim().toLowerCase();
  if (seen.has(key)) { problems.push(`duplicate: ${where}`); continue; }
  seen.add(key);
  if (year < oldestYear) { tooOld.push(where); continue; }
  built.push({
    subject: 'Year in Review',
    topic: `${MONTHS[m - 1]} ${year}`,
    question,
    answer,
    solution: check,
    level,
    year,
    timedSeconds: null,
    status: 'pending',
    source: 'claude-written',
    createdAt: new Date()
  });
}

const tally = {};
for (const b of built) {
  const t = tally[b.level] || (tally[b.level] = { total: 0 });
  t.total++;
  t[b.year] = (t[b.year] || 0) + 1;
}
console.log(`written: ${Q.length}, ready: ${built.length}`);
Object.entries(tally).forEach(([level, t]) => console.log(`  ${level.padEnd(9)}${JSON.stringify(t)}`));
if (tooOld.length) { console.log(`left out, before ${oldestYear} so rounds would never read them: ${tooOld.length}`); }
if (problems.length) {
  console.log(`\nproblems (fix these; nothing is inserted while any remain): ${problems.length}`);
  problems.forEach(p => console.log('  ! ' + p));
  process.exit(1);
}

if (!argv.write) {
  console.log('\nDRY RUN - pass --write to insert. Sample:');
  built.slice(0, argv.show).forEach(b => console.log(`\n  [${b.level}, ${b.topic}] ${b.question}\n    ANSWER: ${b.answer}\n    check:  ${b.solution}`));
  process.exit(0);
}

// skip anything queued before, whatever became of it, so a rejected question
// is not put back in front of the reviewer
const existing = new Set((await pending.distinct('question', { subject: 'Year in Review' })).map(q => String(q)));
const fresh = built.filter(b => !existing.has(b.question));
console.log(`\nalready in the queue: ${built.length - fresh.length}`);
if (!fresh.length) {
  console.log('nothing new to insert');
  process.exit(0);
}
const res = await pending.insertMany(fresh);
console.log(`inserted ${res.insertedCount} new questions`);
console.log(`queue now holds ${await pending.countDocuments({ status: 'pending' })} pending`);
process.exit(0);
