export default {
    // cards: array of 7 cards in a format of [♥9,♣8,♠7,♦10,♠6]
    checkRoyalFlush(cards){
        if (this.checkStraightFlush(cards)) {
            let ends = getStraightEnds(cards);
            if (ends[0]==10 && ends[1]==14) {
                return true;
            }
        }
        return false;
    },
    checkStraightFlush(cards){
        let flush = getFlushColor(cards);
        if (flush!=false && this.checkStraight(cards, flush)) {
            return true;
        }
        return false;
    },
    checkFourOfAKind(cards){
        return checkNOfAKind(cards, 4);
    },
    checkFullHouse(cards){
        const map = new Map();
        cards.map(x=>convertToValue(x.slice(1))).forEach(value => {
            if (map.has(value)) {
                map.set(value, map.get(value)+1)
            }else{
                map.set(value, 1)
            }
        });
        let found1 = false;
        let found2 = false;
        map.forEach((value, key, map)=>{
            if (value == 3) {
                found1 = true;
            }
            if (value == 2) {
                found2 = true
            }
        })
        if (found1&&found2) {
            return true;
        }
        return false;
    },
    checkFlush(cards){
        const map = new Map();
        cards.map(x=>x[0]).forEach(color => {
            if (map.has(color)) {
                map.set(color, map.get(color)+1)
            }else{
                map.set(color, 1)
            }
        });
        let found = false;
        map.forEach((value, key, map)=>{
            if (value >= 5) {
                found = true;
            }
        })
        return found;
    },
    checkStraight(cards, color){
        let longestStreak = 1;
        let sortedValues;
        if (color == null) {
            sortedValues = cards.map(x=>convertToValue(x.slice(1))).sort((a,b)=>{return a-b});
        }else{
            sortedValues = cards.filter(x=>x[0]==color).map(x=>convertToValue(x.slice(1))).sort((a,b)=>{return a-b});
        }
        for (let i = 0; i < sortedValues.length; i++) {
            const value = sortedValues[i];
            if (i>0 && sortedValues[i-1]+1==value) {
                longestStreak++;
            }else if(sortedValues[i-1]!=value){
                // console.log(longestStreak);
                longestStreak = 1;
            }
            if (longestStreak == 5) {
                return true;
            }
        }
        return false;
    },
    checkThreeOfAKind(cards){
        return checkNOfAKind(cards, 3);
    },
    checkTwoPair(cards){
        const map = new Map();
        cards.map(x=>convertToValue(x.slice(1))).forEach(value => {
            if (map.has(value)) {
                map.set(value, map.get(value)+1)
            }else{
                map.set(value, 1)
            }
        });
        // console.log(map);
        
        let found = 0;
        map.forEach((value, key, map)=>{
            if (value >= 2) {
                found++;
            }
        })
        if (found>=2) {
            return true;
        }
        return false;
    },
    checkPair(cards){
        return checkNOfAKind(cards, 2);
    },
    checkHighCard(cards){
        // remove first character
        return cards.map(x=>x.slice(1)).sort()[0];
    },
    getHandValue(cards){
        return cards.map(x=>convertToValue(x.slice(1))).reduce((sum, a)=>{
            return sum+a;
        },0);
    }
}

const convertToValue = (value)=>{
    if (isNaN(value)) {
        switch (value) {
            case 'J':
                return 11;
            case 'Q':
                return 12;
            case 'K':
                return 13;
            case 'A':
                return 14;
            default:
                break;
        }
    }
    return Number(value);
}

const getFlushColor = (cards)=>{
    const map = new Map();
    cards.map(x=>x[0]).forEach(color => {
        if (map.has(color)) {
            map.set(color, map.get(color)+1)
        }else{
            map.set(color, 1)
        }
    });
    let found = false;
    map.forEach((value, key, map)=>{
        if (value >= 5) {
            found = key;
        }
    })
    return found;
}

const getStraightEnds = (cards, color)=>{
    let longestStreak = 1;
    let sortedValues;
    let min = 0;
    let max = 0;
    if (color == null) {
        sortedValues = cards.map(x=>convertToValue(x.slice(1))).sort((a,b)=>{return a-b});
    }else{
        sortedValues = cards.filter(x=>x[0]==color).map(x=>convertToValue(x.slice(1))).sort((a,b)=>{return a-b});
    }
    for (let i = 0; i < sortedValues.length; i++) {
        const value = sortedValues[i];
        if (i>0 && sortedValues[i-1]+1==value) {
            max = value;
            longestStreak++;
        }else if(sortedValues[i-1]!=value){
            // console.log(longestStreak);
            longestStreak = 1;
            min = value;
            max = value;
        }
        if (longestStreak == 5) {
            return [min, max];
        }
    }
    return false;
}

const checkNOfAKind = (cards, n)=>{
    const map = new Map();
    cards.map(x=>convertToValue(x.slice(1))).forEach(value => {
        if (map.has(value)) {
            map.set(value, map.get(value)+1)
        }else{
            map.set(value, 1)
        }
    });
    let found = false;
    map.forEach((value, key, map)=>{
        if (value >= n) {
            found = true;
        }
    })
    return found;
}