# Voice input accuracy (20 Nov 2026, measured on this computer)

| language | model | clips | word error rate | character error rate | median time per clip |
|---|---|---|---|---|---|
| Kannada | AI4Bharat IndicConformer 600M (MIT) | 10 | 3.4% | 1.0% | 1.30 s |
| English | NVIDIA Parakeet TDT 0.6B v2 (CC-BY-4.0) | 10 | 2.8% | 0.9% | 1.93 s |

Clips: English = LibriSpeech (clean read speech, hf-internal-testing/librispeech_asr_dummy); Kannada = arpit-tiwari/kannada-asr-filtered test split (read news sentences). Small samples: indicators, not proof.

## Every clip

| lang | correct text | recognised text | audio s | took s |
|---|---|---|---|---|
| kn | ಕರುಣಾಮೂರ್ತಿ ಅಲ್ಪ ಸಂಖ್ಯಾತ ಸಮುದಾಯದ ಮೆಹಬೂಬ್‌ ಸಾಬ್‌ ಪ್ರಮುಖರಾಗಿದ್ದಾರೆ | ಕರುಣಾಮೂರ್ತಿ ಅಲ್ಪಸಂಖ್ಯಾತ ಸಮುದಾಯ ಮೆಹಬೂಬ್ ಸಾಬ್್ ಪ್ರಮುಖರಾಗಿದ್ದಾರೆ | 5.8 | 10.13 |
| kn | ಡಾಕ್ಟರ್ ಒಡೆಯರ್‌ ಚನ್ನಮಲ್ಲಿಕಾರ್ಜುನ ಶಿವಾಚಾರ್ಯ ಸ್ವಾಮೀಜಿ ಸಮಾರಂಭದ ಸಾನ್ನಿಧ್ಯವಹಿಸಿದ್ದರು | ಡಾಕ್ಟರ್ ಒಡೆಯರ್ ಚೆನ್ನಮಲ್ಲಿಕಾರ್ಜುನ ಶಿವಾಚಾರ್ಯ ಸ್ವಾಮೀಜಿ ಸಮಾರಂಭದ ಸಾನಿಧ್ಯ ವಹಿಸಿದ್ದರು | 6.0 | 1.22 |
| kn | ಅದರಲ್ಲೂ ಕರ್ನಾಟಕ ರಾಜ್ಯದ ಅಭಿವೃದ್ಧಿಗೆ ಅವರು ಸಾಲು ಸಾಲು ಕೊಡುಗೆಗಳನ್ನು ನೀಡಿದ್ದಾರೆ | ಅದಲ್ಲ ಕರ್ನಾಟಕ ರಾಜ್ಯದ ಅಭಿವೃದ್ಧಿಗೆ ಅವರು ಸಾಲು ಸಾಲು ಕೊಡುಗೆಗಳನ್ನು ನೀಡಿದ್ದಾರೆ | 5.1 | 1.18 |
| kn | ವಸತಿ ಸಂಕೀರ್ಣ ನಿರ್ಮಿಸಿ ಪಂಪಂ ಸಿಬ್ಬಂದಿಗೆ ವಸತಿ ಸಂಕೀರ್ಣ ನಿರ್ಮಿಸಬೇಕು ಎಂದು ಕೆಲವರು ಸಲಹೆ ನೀಡಿದರು | ವಸತಿ ಸಂಕೀರ್ಣ ನಿರ್ಮಿಸಿ ಪಂಪಂ ಸಿಬ್ಬಂದಿಗೆ ವಸತಿ ಸಂಕೀರ್ಣ ನಿರ್ಮಿಸಬೇಕು ಎಂದು ಕೆಲವರು ಸಲಹೆ ನೀಡಿದರು | 9.2 | 1.56 |
| kn | ಬಳಿಕ ಸಚಿವ ರಮೇಶ್‌ ಜಾರಕಿಹೊಳಿ ಅವರು ನಾಗೇಂದ್ರ ಅವರ ಜತೆ ಆಗಮಿಸಿ ಡಿಕೆ ಶಿವಕುಮಾರ್‌ ಆರೋಗ್ಯ ವಿಚಾರಿಸಿದರು | ಬಳಿಕ ಸಚಿವ ರಮೇಶ್ ಜಾರಕಿಹೊಳಿ ಅವರ ನಾಗೇಂದ್ರ ಅವರ ಜತೆ ಆಗಮಿಸಿ ಡಿಕೆ ಶಿವಕುಮಾರ್ ಆರೋಗ್ಯ ವಿಚಾರಿಸಿದರು | 7.8 | 1.43 |
| kn | ಬೆಳಗಾವಿ ಅಧಿವೇಶನದಲ್ಲಿ ಎನ್‌ಪಿಎಸ್‌ ನೌಕರರ ಪರವಾಗಿ ನಿರ್ಧಾರವನ್ನು ತೆಗೆದುಕೊಳ್ಳಲೇಬೇಕು | ಬೆಳಗಾವಿ ಅಧಿವೇಶನದಲ್ಲಿ ಎನ್ಪಿಎಸ್ ನೌಕರರ ಪರವಾಗಿ ನಿರ್ಧಾರವನ್ನು ತೆಗೆದುಕೊಳ್ಳಲೇಬೇಕು | 7.7 | 1.37 |
| kn | ಇದರ ವಿಡಿಯೋ ಹಾಗೂ ಫೋಟೋಗಳು ಸೋಷಿಯಲ್‌ ಮೀಡಿಯಾದಲ್ಲಿ ವೈರಲ್‌ ಆಗಲಿವೆ | ಇದರ ವಿಡಿಯೋ ಹಾಗೂ ಫೋಟೋಗಳು ಸೋಷಿಯಲ್ ಮೀಡಿಯಾದಲ್ಲಿ ವೈರಲ್ ಆಗಲಿವೆ | 7.2 | 1.30 |
| kn | ಮತ್ತೊಂದೆಡೆ ಕಾಂಗ್ರೆಸ್ಸಿಗರು ವೀರಪ್ಪ ಮೊಯ್ಲಿಗೆ ಜೈಕಾರ ಹಾಕುತ್ತಿದದ್ದು ಕಂಡು ಬಂದಿತ್ತು | ಮತ್ತೊಂದೆಡೆ ಕಾಂಗ್ರೆಸ್ಸಿಗರು ವೀರಪ್ಪ ಮೊಯಿಲಿಗೆ ಜೈಕಾರ ಹಾಕುತ್ತಿದ್ದದ್ದು ಕಂಡು ಬಂದಿತ್ತು | 6.5 | 1.29 |
| kn | ಮುಂದಿನ ದಿನಗಳಲ್ಲಿ ಮತ್ತಷ್ಟು ಪ್ರಯೋಗಗಳು ಕಾಣುವಂತಾಗಲಿ ಎಂಬ ಆಶಯವನ್ನು ಅವರು ವ್ಯಕ್ತಪಡಿಸಿದರು | ಮುಂದಿನ ದಿನಗಳಲ್ಲಿ ಮತ್ತಷ್ಟುಪ್ರಯೋಗಗಳು ಕಾಣುವಂತಾಗಲಿ ಎಂಬ ಆಶಯವನ್ನು ಅವರು ವ್ಯಕ್ತಪಡಿಸಿದರು | 5.3 | 1.18 |
| kn | ಹುತಾತ್ಮ ದಿನವನ್ನು ಶೌರ್ಯ ದಿವಸವೆಂದು ಆಚರಿಸಿ ಸಿಹಿ ಹಂಚಿ ಗೋಡ್ಸೆ ಪುತ್ಥಳಿಕೆ ಮಾಲಾರ್ಪಣೆ ಮಾಡಿಕೊಂಡು ಬಂದಿದೆ | ಹುತಾತ್ಮ ದಿನವನ್ನು ಶೌರ್ಯ ದಿವಸವೆಂದು ಆಚರಿಸಿ ಸಿಹಿ ಹಂಚಿ ಗೋಡ್ಸೆ ಪುತ್ಥಳಿಕೆ ಮಾಲಾರ್ಪಣೆ ಮಾಡಿಕೊಂಡು ಬಂದಿದೆ | 10.1 | 1.61 |
| en | MISTER QUILTER IS THE APOSTLE OF THE MIDDLE CLASSES AND WE ARE GLAD TO WELCOME HIS GOSPEL | mister Quilter is the Apostle of the Middle Classes, and we are glad to welcome his gospel. | 5.9 | 8.63 |
| en | NOR IS MISTER QUILTER'S MANNER LESS INTERESTING THAN HIS MATTER | Nor is mister Quilter's manner less interesting than his manner. | 4.8 | 0.97 |
| en | HE TELLS US THAT AT THIS FESTIVE SEASON OF THE YEAR WITH CHRISTMAS AND ROAST BEEF LOOMING BEFORE US SIMILES DRAWN FROM EATING AND ITS RESULTS OCCUR MOST READILY TO THE MIND | He tells us that at this festive season of the year, with Christmas and roast beef looming before us, similes drawn from eating and its results occur most readily to the mind. | 12.5 | 2.49 |
| en | HE HAS GRAVE DOUBTS WHETHER SIR FREDERICK LEIGHTON'S WORK IS REALLY GREEK AFTER ALL AND CAN DISCOVER IN IT BUT LITTLE OF ROCKY ITHACA | He has grave doubts whether Sir Frederick Leighton's work is really Greek after all, and can discover in it but little of rocky Ithaca. | 9.9 | 3.84 |
| en | LINNELL'S PICTURES ARE A SORT OF UP GUARDS AND AT EM PAINTINGS AND MASON'S EXQUISITE IDYLLS ARE AS NATIONAL AS A JINGO POEM MISTER BIRKET FOSTER'S LANDSCAPES SMILE AT ONE MUCH IN THE SAME WAY THAT MISTER CARKER USED TO FLASH HIS TEETH AND MISTER JOHN COLLIER GIVES HIS SITTER A CHEERFUL SLAP ON THE BACK BEFORE HE SAYS LIKE A SHAMPOOER IN A TURKISH BATH NEXT MAN | Linnell's pictures are a sort of Up Guards and Adam paintings, and Mason's exquisite idylls are as national as a jingo poem. mister Burkitt Foster's landscapes smile at one much in the same way that mister Carker used to flash his teeth and mister John Collier gives his sitter a cheerful slap on the back, before he says, like a shampooer in a Turkish bath, Next man | 29.4 | 6.58 |
| en | IT IS OBVIOUSLY UNNECESSARY FOR US TO POINT OUT HOW LUMINOUS THESE CRITICISMS ARE HOW DELICATE IN EXPRESSION | It is obviously unnecessary for us to point out how luminous these criticisms are, how delicate in expression. | 9.0 | 1.80 |
| en | ON THE GENERAL PRINCIPLES OF ART MISTER QUILTER WRITES WITH EQUAL LUCIDITY | On the general principles of art mister Quilter writes with equal lucidity | 5.6 | 1.07 |
| en | PAINTING HE TELLS US IS OF A DIFFERENT QUALITY TO MATHEMATICS AND FINISH IN ART IS ADDING MORE FACT | Painting, he tells us, is of a different quality to mathematics, and finish in art is adding more fact. | 9.2 | 1.93 |
| en | AS FOR ETCHINGS THEY ARE OF TWO KINDS BRITISH AND FOREIGN | As for etchings, they are of two kinds British and foreign. | 5.1 | 1.04 |
| en | HE LAMENTS MOST BITTERLY THE DIVORCE THAT HAS BEEN MADE BETWEEN DECORATIVE ART AND WHAT WE USUALLY CALL PICTURES MAKES THE CUSTOMARY APPEAL TO THE LAST JUDGMENT AND REMINDS US THAT IN THE GREAT DAYS OF ART MICHAEL ANGELO WAS THE FURNISHING UPHOLSTERER | He laments most bitterly the divorce that has been made between decorative art and what we usually call pictures, makes a customary appeal to the Last Judgment, and reminds us that in the great days of art Michelangelo was the furnishing upholsterer. | 18.3 | 3.58 |
