// sync-merge.js — 同步数据合并引擎（纯函数，浏览器/node 通用）
// 基于逐条目的"最后写赢"(LWW)合并策略，用 updatedAt 时间戳判断新旧。
// 由 cloud-sync.js 的 pull/push 流程调用。

var SyncMerge = (function() {

  /**
   * 比较两个条目的 updatedAt，返回较新的那个。
   * 没有 updatedAt 的条目视为极旧（旧版 v3 数据上云），
   * 两端都没有则取本地（保守）。
   * 若 newerItem 是墓碑（_deleted: true），返回 null 表示应删除。
   * @param {object} localItem
   * @param {object} remoteItem
   * @returns {object|null} 胜出的条目，或 null 表示删除
   */
  function lwwWinner(localItem, remoteItem) {
    var localTs = localItem && localItem.updatedAt;
    var remoteTs = remoteItem && remoteItem.updatedAt;
    // 墓碑优先：若一方是墓碑且更新，则该墓碑生效
    if (localItem._deleted && remoteItem._deleted) {
      // 两端都删了，比较 updatedAt 取更新的墓碑
      if (localTs && remoteTs) return remoteTs > localTs ? remoteItem : localItem;
      return localItem;
    }
    if (localItem._deleted && localTs && (!remoteTs || localTs > remoteTs)) return localItem; // 本地删更新
    if (remoteItem._deleted && remoteTs && (!localTs || remoteTs > localTs)) return remoteItem; // 远程删更新
    if (localItem._deleted && !remoteTs) return null; // 本地删但远程无时间戳 → 保守保留远程
    if (remoteItem._deleted && !localTs) return null; // 远程删但本地无时间戳 → 保守保留本地
    // 都未删除：比较 updatedAt
    if (localTs && remoteTs) return remoteTs > localTs ? remoteItem : localItem;
    if (!localTs && !remoteTs) return localItem; // 都无时间戳 → 保守取本地
    return localTs ? localItem : remoteItem; // 有时间戳的一方赢
  }

  /**
   * 核心合并：两个条目数组按 ID 合并。
   * 递归处理子条目（block.tasks / item.stages / bigTask subtask.stages 等）。
   * @param {Array} localArr  本地数组
   * @param {Array} remoteArr 远程数组
   * @param {string} [childKey]  子条目数组的键名（如 'tasks', 'stages'）
   * @returns {Array} 合并后的数组
   */
  function mergeArrayById(localArr, remoteArr, childKey) {
    localArr = localArr || [];
    remoteArr = remoteArr || [];
    var merged = {};
    var order = []; // 保留插入顺序

    // 索引本地
    localArr.forEach(function(item) {
      if (item && item.id) {
        merged[item.id] = item;
        order.push(item.id);
      }
    });
    // 索引远程（添加新 ID 或覆盖已有）
    remoteArr.forEach(function(item) {
      if (!item || !item.id) return;
      if (merged[item.id]) {
        // 两端都有：LWW 决胜
        var winner = lwwWinner(merged[item.id], item);
        if (winner === null || winner._deleted) {
          // 墓碑胜出 → 该条目从合并结果中删除
          delete merged[item.id];
          return;
        }
        merged[item.id] = winner;
      } else {
        // 只存在于远程
        if (item._deleted) return; // 远程墓碑且本地没有 → 忽略
        merged[item.id] = item;
        order.push(item.id);
      }
    });

    // 递归合并子条目（递归调用 mergeArrayById 合并子数组）
    function mergeChildren(parent, childArrLocal, childArrRemote, key) {
    if (!parent || !parent[key]) {
      if (childArrRemote && childArrRemote.length > 0) {
        parent[key] = childArrRemote;
        }
	    return;
      }
      if (childArrRemote && childArrRemote.length > 0) {
        parent[key] = mergeArrayById(childArrLocal || parent[key], childArrRemote);
    }
    }

    // 建立远程/本地的 ID→item 索引
    var remoteIdx = {};
    remoteArr.forEach(function(it) { if (it && it.id) remoteIdx[it.id] = it; });
    var localIdx = {};
    localArr.forEach(function(it) { if (it && it.id) localIdx[it.id] = it; });

    // 重建数组，逐条目递归合并子数组
    var result = [];
    order.forEach(function(id) {
    if (merged[id] !== undefined) {
      var item = merged[id];

	    // 1. block 内的子任务：分别取本地和远程版合并
	    if (item.blockName !== undefined && item.tasks) {
	      var localTasks = (localIdx[item.id] && localIdx[item.id].tasks) || [];
	      var remoteTasks = (remoteIdx[item.id] && remoteIdx[item.id].tasks) || [];
	      if (localTasks.length > 0 || remoteTasks.length > 0) {
	        item.tasks = mergeArrayById(localTasks, remoteTasks);
	      }
	    }
	    // 2. 任务/子任务的阶段
	    if (item.stages || (localIdx[item.id] && localIdx[item.id].stages) || (remoteIdx[item.id] && remoteIdx[item.id].stages)) {
	      var localStages = (localIdx[item.id] && localIdx[item.id].stages) || [];
	      var remoteStages = (remoteIdx[item.id] && remoteIdx[item.id].stages) || [];
	      if (localStages.length > 0 || remoteStages.length > 0) {
	        item.stages = mergeArrayById(localStages, remoteStages);
	      }
	    }
	    // 3. 里程碑内的子任务（大任务场景）
	    if (item.milestones && item.milestones.length > 0) {
	      var localMs = (localIdx[item.id] && localIdx[item.id].milestones) || [];
	      var remoteMs = (remoteIdx[item.id] && remoteIdx[item.id].milestones) || [];
	      if (localMs.length > 0 || remoteMs.length > 0) {
	        item.milestones = mergeArrayById(localMs, remoteMs);
	      }
	    }

	    result.push(item);
	  }
	});

    return result;
  }

  /**
   * 合并单个日期的象限数据。
   * @param {object} localDD  { I:[], II:[], III:[], IV:[] }
   * @param {object} remoteDD 同上
   * @returns {object} 合并后的象限数据
   */
  function mergeDateData(localDD, remoteDD) {
    localDD = localDD || { I: [], II: [], III: [], IV: [] };
    remoteDD = remoteDD || { I: [], II: [], III: [], IV: [] };
    var result = {};
    ['I', 'II', 'III', 'IV'].forEach(function(key) {
      result[key] = mergeArrayById(localDD[key] || [], remoteDD[key] || []);
      // 递归合并 block 内的子任务
      result[key] = result[key].map(function(item) {
        if (item.blockName !== undefined && item.tasks) {
          // block 的子任务按 ID 合并
          // 需要远程对应的 block 的子任务 → 在 mergeArrayById 中 block 对象整体已通过 lwwWinner 处理
          // 但如果 block 的两端版本不同，当前 lwwWinner 返回整个 block 对象（更新的那个）
          // 这可能导致子任务列表被整体覆盖。更精细的做法是 mergeBlockSubtasks。
          // 暂时保持整体覆盖以匹配"逐条目"语义。
        }
        return item;
      });
    });
    return result;
  }

  /**
   * 合并全部日期的多日数据。
   * @param {object} localAll  { '2026-07-11': {I:[],...}, '2026-07-12': {...}, ... }
   * @param {object} remoteAll 同上
   * @returns {object} 合并后的多日数据
   */
  function mergeAllDateData(localAll, remoteAll) {
    localAll = localAll || {};
    remoteAll = remoteAll || {};
    var result = {};
    var allDates = {};
    Object.keys(localAll).forEach(function(d) { allDates[d] = true; });
    Object.keys(remoteAll).forEach(function(d) { allDates[d] = true; });
    Object.keys(allDates).sort().forEach(function(date) {
      result[date] = mergeDateData(localAll[date], remoteAll[date]);
    });
    return result;
  }

  /**
   * 通用合并：两个对象数组按 ID 合并（用于大任务、计划池、原则等扁平列表）。
   * @param {Array} localArr
   * @param {Array} remoteArr
   * @returns {Array} 合并后的数组
   */
  function mergeFlatArray(localArr, remoteArr) {
    return mergeArrayById(localArr, remoteArr);
  }

  /**
   * 合并原则数据（含 priorityProblems）。
   * @param {object} localPr  { id, startDate, endDate, principles: [], priorityProblems: [] }
   * @param {object} remotePr 同上
   * @returns {object} 合并后的原则数据
   */
  function mergePrinciples(localPr, remotePr) {
    localPr = localPr || { id: '', startDate: '', endDate: '', principles: [], priorityProblems: [] };
    remotePr = remotePr || { id: '', startDate: '', endDate: '', principles: [], priorityProblems: [] };
    return {
      id: localPr.id || remotePr.id || '',
      startDate: remotePr.startDate && (!localPr.startDate || (remotePr.updatedAt && remotePr.updatedAt > (localPr.updatedAt || ''))) ? remotePr.startDate : localPr.startDate,
      endDate: remotePr.endDate && (!localPr.endDate || (remotePr.updatedAt && remotePr.updatedAt > (localPr.updatedAt || ''))) ? remotePr.endDate : localPr.endDate,
      updatedAt: remotePr.updatedAt && (!localPr.updatedAt || remotePr.updatedAt > localPr.updatedAt) ? remotePr.updatedAt : localPr.updatedAt,
      principles: mergeArrayById(localPr.principles || [], remotePr.principles || []),
      priorityProblems: mergeArrayById(localPr.priorityProblems || [], remotePr.priorityProblems || [])
    };
  }

  /**
   * 合并缓存日期索引（并集）。
   */
  function mergeCachedDatesIndex(localIdx, remoteIdx) {
    localIdx = localIdx || [];
    remoteIdx = remoteIdx || [];
    var merged = localIdx.slice();
    remoteIdx.forEach(function(d) {
      if (merged.indexOf(d) === -1) merged.push(d);
    });
    merged.sort();
    return merged;
  }

  /**
   * 定义本地数据与远程数据之间的差异统计（用于判断"远端是否有新数据"）。
   * @returns {number} 新增或更新的条目数
   */
  function countRemoteChanges(localAll, remoteAll) {
    var count = 0;
    var allDates = {};
    Object.keys(localAll || {}).forEach(function(d) { allDates[d] = true; });
    Object.keys(remoteAll || {}).forEach(function(d) { allDates[d] = true; });
    Object.keys(allDates).forEach(function(date) {
      var loc = localAll[date] || {};
      var rem = remoteAll[date] || {};
      ['I', 'II', 'III', 'IV'].forEach(function(key) {
        var locArr = loc[key] || [];
        var remArr = rem[key] || [];
        remArr.forEach(function(item) {
          if (!item || !item.id) return;
          var localItem = locArr.filter(function(li) { return li.id === item.id; })[0];
          if (!localItem) { count++; return; }
          if (item.updatedAt && (!localItem.updatedAt || item.updatedAt > localItem.updatedAt)) count++;
        });
      });
    });
    return count;
  }

  // ============ 公开 API ============
  return {
    lwwWinner: lwwWinner,
    mergeArrayById: mergeArrayById,
    mergeDateData: mergeDateData,
    mergeAllDateData: mergeAllDateData,
    mergeFlatArray: mergeFlatArray,
    mergePrinciples: mergePrinciples,
    mergeCachedDatesIndex: mergeCachedDatesIndex,
    countRemoteChanges: countRemoteChanges
  };
})();
